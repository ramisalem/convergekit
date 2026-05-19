import { accessPolicyConfig, assertAllowedAccessPolicyRepository } from '@convergekit/config/access-policy'
import {
  account,
  branches,
  db,
  documents,
  getUserAiSettings,
  mcpTokenAlerts,
  mcpTokens,
  repositories,
  resetBranchIndexState,
  updateRepositoryStatus,
  user as users,
  wikiPages,
} from '@convergekit/db'
import {
  incrementalQueue,
  mindMapQueue,
  QUEUE_NAMES,
  repositoryQueue,
  translationQueue,
  wikiGenerationQueue,
} from '@convergekit/queues'
import { createRepositorySchema } from '@convergekit/types'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { NotFoundError, ValidationError } from '../errors.js'
import { findExistingRepositoryDocsJob } from '../lib/docs-jobs.js'
import {
  assertRepositoryEmbeddingCompatibility,
  getRepositoryEmbeddingState,
} from '../lib/embedding-compatibility.js'
import {
  fetchAllowedGitHubRepositories,
  verifyGitHubRepositoryVisible,
} from '../lib/github-access.js'
import { buildMcpTokenConfig } from '../lib/mcp-config.js'
import { runMcpConnectionTest, summarizeMcpConnectionTest } from '../lib/mcp-connection-test.js'
import {
  ALL_MCP_SCOPES,
  createMcpTokenSecret,
  expectedMcpToolsForScopes,
  getMcpConnectionTestBlockReason,
  getMcpTokenStatus,
  hashMcpToken,
  normalizeMcpScopes,
  resolveMcpTokenExpiry,
  type McpScope,
} from '../lib/mcp-token-policy.js'
import {
  listMcpTokenAuditEvents,
  listOpenMcpTokenAlerts,
  revokeActiveMcpTokensForRepository,
} from '../lib/mcp-token-security.js'
import { getRepositoryGuideSummary } from '../lib/repo-guide.js'
import { serializeRepositoryForResponse } from '../lib/repository-response.js'
import { assertRepoAccess, assertRepoAdminAction, scopedRepositoryIds } from '../lib/scoping.js'

export const repositoryRoutes = new Hono()
const MINDMAP_PATH = '__mindmap__'

function parseScopes(scope: string | null | undefined): Set<string> {
  if (!scope) return new Set()
  return new Set(
    scope
      .split(/[,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean),
  )
}

/**
 * POST /api/repositories
 * Create a new repository record and enqueue an analysis job.
 * Returns { repositoryId, jobId } with 202 Accepted.
 */
repositoryRoutes.post('/', async (c) => {
  const userId = c.get('userId')
  const body = createRepositorySchema.parse(await c.req.json())

  let parsedRepository
  try {
    parsedRepository = assertAllowedAccessPolicyRepository({
      provider: body.provider,
      cloneUrl: body.cloneUrl,
    })
  } catch (error) {
    throw new ValidationError(error instanceof Error ? error.message : 'Repository is not allowed')
  }

  const githubAccount = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.providerId, 'github')),
  })

  if (!githubAccount?.accessToken) {
    return c.json({ error: 'Reconnect GitHub to add repositories.' }, 403)
  }

  const repositoryVisible = await verifyGitHubRepositoryVisible(
    githubAccount.accessToken,
    parsedRepository.owner,
    parsedRepository.name,
  )

  if (!repositoryVisible) {
    return c.json({ error: `GitHub token cannot access ${parsedRepository.fullName}` }, 403)
  }

  // For private repos, embed credentials in the clone URL so the worker can
  // git-clone without any additional auth setup.
  // Priority: explicit accessToken from form > stored GitHub OAuth token.
  let cloneUrl = body.cloneUrl
  if (body.isPrivate) {
    const token = body.accessToken ?? githubAccount.accessToken
    if (token) {
      // Embed as: https://x-oauth-token:<token>@github.com/...
      const parsed = new URL(cloneUrl)
      parsed.username = 'x-oauth-token'
      parsed.password = token
      cloneUrl = parsed.toString()
    }
  }

  const [repo] = await db
    .insert(repositories)
    .values({
      name: body.name,
      cloneUrl,
      provider: body.provider,
      defaultBranch: body.defaultBranch,
      isPrivate: body.isPrivate,
      status: 'pending',
      userId,
    })
    .returning()

  const [branch] = await db
    .insert(branches)
    .values({ repositoryId: repo.id, name: body.defaultBranch })
    .returning()

  const job = await repositoryQueue.add('analyze', {
    repositoryId: repo.id,
    branchId: branch.id,
    cloneUrl: repo.cloneUrl,
    provider: repo.provider,
  })

  return c.json({ repositoryId: repo.id, jobId: job.id }, 202)
})

/**
 * GET /api/repositories
 * List all repositories belonging to the authenticated user.
 */
repositoryRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const allowed = await scopedRepositoryIds(userId)

  const repos = await db
    .select()
    .from(repositories)
    .where(
      and(
        isNull(repositories.deletedAt),
        allowed.size > 0 ? inArray(repositories.id, [...allowed]) : sql`false`,
      ),
    )
    .orderBy(desc(repositories.createdAt))

  return c.json({ repositories: repos.map(serializeRepositoryForResponse) })
})

/**
 * GET /api/repositories/github-repos
 * List all GitHub repositories the authenticated user can access, including
 * organization repositories, using their stored OAuth token.
 */
repositoryRoutes.get('/github-repos', async (c) => {
  const userId = c.get('userId')

  const githubAccount = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.providerId, 'github')),
  })

  if (!githubAccount?.accessToken) {
    return c.json({
      repos: [],
      requiresReconnect: true,
      warning: 'Reconnect GitHub to load repositories.',
    })
  }
  const accessToken = githubAccount.accessToken
  const grantedScopes = parseScopes(githubAccount.scope)
  const hasReadOrgScope = grantedScopes.has('read:org')

  if (accessPolicyConfig.allowedGitHubOrg && !hasReadOrgScope) {
    return c.json({
      repos: [],
      requiresReconnect: true,
      warning: `Reconnect GitHub with read:org access to load ${accessPolicyConfig.allowedGitHubOrg} repositories.`,
    })
  }

  try {
    const repos = await fetchAllowedGitHubRepositories(accessToken)
    return c.json({
      repos: repos.map(({ updatedAt: _updatedAt, ...repo }) => repo),
      requiresReconnect: false,
      warning: null,
    })
  } catch {
    return c.json({
      repos: [],
      requiresReconnect: false,
      warning: accessPolicyConfig.allowedGitHubOrg
        ? `Unable to load ${accessPolicyConfig.allowedGitHubOrg} repositories. Complete GitHub SSO authorization and try again.`
        : 'Unable to load GitHub repositories. Reconnect GitHub and try again.',
    })
  }
})

repositoryRoutes.get('/:id/guide', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  await assertRepoAccess(userId, id)
  return c.json({ guide: await getRepositoryGuideSummary(id) })
})

/**
 * GET /api/repositories/:id
 * Get a single repository with its current processing status.
 */
repositoryRoutes.get('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  await assertRepoAccess(userId, id)

  const repo = await db.query.repositories.findFirst({
    where: and(eq(repositories.id, id), isNull(repositories.deletedAt)),
  })

  if (!repo) throw new NotFoundError('Repository')

  const aiSettings = await getUserAiSettings(userId)
  const state = await getRepositoryEmbeddingState(id, aiSettings)

  return c.json({
    repository: {
      ...serializeRepositoryForResponse(repo),
      indexedAt: state.branch?.lastIndexedAt?.toISOString() ?? null,
      embeddingProfile: state.storedProfile
        ? {
            provider: state.storedProfile.provider,
            model: state.storedProfile.model,
            dimensions: state.storedProfile.dimensions,
            endpoint: state.storedProfile.endpoint,
            capturedAt: state.branch?.embeddingProfileCapturedAt?.toISOString() ?? null,
          }
        : null,
      embeddingCompatibility: state.compatibility ?? null,
    },
  })
})

/**
 * POST /api/repositories/:id/reindex
 * Clear all indexed data and queue a fresh analysis job.
 */
repositoryRoutes.post('/:id/reindex', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  await assertRepoAdminAction(userId, id)

  const repo = await db.query.repositories.findFirst({
    where: and(eq(repositories.id, id), isNull(repositories.deletedAt)),
  })
  if (!repo) throw new NotFoundError('Repository')

  const branch = await db.query.branches.findFirst({
    where: eq(branches.repositoryId, id),
  })
  if (!branch) throw new NotFoundError('Branch')

  // Cancel any in-flight jobs across all queues
  const queues = [
    repositoryQueue,
    incrementalQueue,
    translationQueue,
    mindMapQueue,
    wikiGenerationQueue,
  ]
  await Promise.all(
    queues.map(async (queue) => {
      const jobs = await queue.getJobs(['waiting', 'delayed', 'prioritized'])
      const repoJobs = jobs.filter(
        (j) =>
          (j.data as { repositoryId?: string })?.repositoryId === id &&
          !j.id?.startsWith('repeat:'),
      )
      await Promise.all(repoJobs.map((j) => j.remove()))
    }),
  )

  // Clear all indexed data (chunks cascade from documents)
  await db.delete(documents).where(eq(documents.branchId, branch.id))
  await db.delete(wikiPages).where(eq(wikiPages.repositoryId, id))
  await resetBranchIndexState(branch.id)

  // Reset status and queue a new analysis job
  await updateRepositoryStatus(id, 'pending')
  const job = await repositoryQueue.add('analyze', {
    repositoryId: id,
    branchId: branch.id,
    cloneUrl: repo.cloneUrl,
    provider: repo.provider,
  })

  return c.json({ jobId: job.id }, 202)
})

/**
 * POST /api/repositories/:id/regenerate-wiki
 * Delete existing derived documentation and regenerate the mind map + wiki,
 * leaving all indexed chunks and embeddings untouched.
 */
repositoryRoutes.post('/:id/regenerate-wiki', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  await assertRepoAdminAction(userId, id)

  const repo = await db.query.repositories.findFirst({
    where: and(eq(repositories.id, id), isNull(repositories.deletedAt)),
  })
  if (!repo) throw new NotFoundError('Repository')

  const branch = await db.query.branches.findFirst({
    where: eq(branches.repositoryId, id),
  })
  if (!branch) throw new NotFoundError('Branch')

  const aiSettings = await getUserAiSettings(userId)
  await assertRepositoryEmbeddingCompatibility(id, aiSettings)

  const existingJob = await findExistingRepositoryDocsJob(id, [wikiGenerationQueue, mindMapQueue])
  if (existingJob) {
    return c.json({ jobId: existingJob.jobId, queue: existingJob.queue, alreadyRunning: true }, 202)
  }

  // Cancel queued documentation jobs for this repository.
  const queuedMindMapJobs = await mindMapQueue.getJobs(['waiting', 'delayed', 'prioritized'])
  const queuedWikiJobs = await wikiGenerationQueue.getJobs(['waiting', 'delayed', 'prioritized'])
  const repoDocJobs = [...queuedMindMapJobs, ...queuedWikiJobs].filter(
    (j) => j.data?.repositoryId === id && !j.id?.startsWith('repeat:'),
  )
  await Promise.all(repoDocJobs.map((j) => j.remove()))

  // Delete existing derived documentation only (chunks/embeddings are preserved).
  await db.delete(wikiPages).where(eq(wikiPages.repositoryId, id))
  await db
    .delete(documents)
    .where(and(eq(documents.branchId, branch.id), eq(documents.path, MINDMAP_PATH)))

  // Keep the repository in a usable "done" state: indexed documents remain
  // available while the derived docs regenerate in the background, and this
  // also heals repositories left stuck in "pending" by older regenerate flows.
  await updateRepositoryStatus(id, 'done')
  const job = await mindMapQueue.add('generate', {
    repositoryId: id,
    branchId: branch.id,
  })

  return c.json({ jobId: job.id, queue: QUEUE_NAMES.MIND_MAP }, 202)
})

/**
 * DELETE /api/repositories/:id
 * Soft-delete a repository and cancel any pending jobs.
 */
repositoryRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  await assertRepoAdminAction(userId, id)

  const [deleted] = await db
    .update(repositories)
    .set({ deletedAt: new Date() })
    .where(eq(repositories.id, id))
    .returning()

  if (!deleted) throw new NotFoundError('Repository')

  await revokeActiveMcpTokensForRepository(id, 'repository_deleted')

  // Cancel any waiting/delayed jobs for this repository across all queues
  const queues = [
    repositoryQueue,
    incrementalQueue,
    translationQueue,
    mindMapQueue,
    wikiGenerationQueue,
  ]
  await Promise.all(
    queues.map(async (queue) => {
      const jobs = await queue.getJobs(['waiting', 'delayed', 'prioritized'])
      const repoJobs = jobs.filter(
        (j) =>
          (j.data as { repositoryId?: string })?.repositoryId === id &&
          !j.id?.startsWith('repeat:'),
      )
      await Promise.all(repoJobs.map((j) => j.remove()))
    }),
  )

  return c.body(null, 204)
})

// ─── MCP token management ─────────────────────────────────────────────────────

const createTokenSchema = z.object({
  label: z.string().min(1).max(100),
  expiresInDays: z.union([z.literal(7), z.literal(30), z.literal(90)]).optional(),
  scopes: z.array(z.enum(ALL_MCP_SCOPES)).optional(),
})

const testMcpConnectionSchema = z.object({
  token: z.string().optional(),
})

const mcpTokenOwnerFilterSchema = z.object({
  userId: z.string().trim().min(1).optional(),
})

async function getRepositoryNameForMcpConfig(repositoryId: string): Promise<string> {
  const [repository] = await db
    .select({ name: repositories.name })
    .from(repositories)
    .where(eq(repositories.id, repositoryId))
    .limit(1)

  if (!repository) throw new NotFoundError('Repository')
  return repository.name
}

function serializeMcpToken(token: {
  id: string
  label: string
  fingerprint: string
  scopes: string[]
  expiresAt: Date
  revokedAt: Date | null
  revokedReason: string | null
  lastUsedAt: Date | null
  lastUsedIp: string | null
  lastUsedUserAgent: string | null
  lastUsedClientName: string | null
  lastUsedToolName: string | null
  createdAt: Date
  alertCount?: number
  owner?: {
    id: string
    name: string
    email: string
  }
}) {
  return {
    id: token.id,
    label: token.label,
    fingerprint: token.fingerprint,
    scopes: token.scopes as McpScope[],
    status: getMcpTokenStatus(token),
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    revokedReason: token.revokedReason,
    lastUsedAt: token.lastUsedAt,
    lastUsedFrom: {
      ip: token.lastUsedIp,
      userAgent: token.lastUsedUserAgent,
      clientName: token.lastUsedClientName,
      toolName: token.lastUsedToolName,
    },
    createdAt: token.createdAt,
    alertCount: token.alertCount ?? 0,
    owner: token.owner ?? null,
  }
}

async function getIsRepositoryAdmin(userId: string): Promise<boolean> {
  const [dbUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  return dbUser?.role === 'admin'
}

async function getMcpTokenOwner(userId: string) {
  const [owner] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  return owner ?? { id: userId, name: 'Unknown user', email: '' }
}

async function assertOwnedMcpToken(userId: string, repositoryId: string, tokenId: string) {
  const token = await db.query.mcpTokens.findFirst({
    where: and(
      eq(mcpTokens.id, tokenId),
      eq(mcpTokens.repositoryId, repositoryId),
      eq(mcpTokens.userId, userId),
    ),
  })
  if (!token) throw new NotFoundError('MCP token')
  return token
}

async function assertAccessibleMcpToken(userId: string, repositoryId: string, tokenId: string) {
  const isRepositoryAdmin = await getIsRepositoryAdmin(userId)
  const token = await db.query.mcpTokens.findFirst({
    where: isRepositoryAdmin
      ? and(eq(mcpTokens.id, tokenId), eq(mcpTokens.repositoryId, repositoryId))
      : and(
          eq(mcpTokens.id, tokenId),
          eq(mcpTokens.repositoryId, repositoryId),
          eq(mcpTokens.userId, userId),
        ),
  })
  if (!token) throw new NotFoundError('MCP token')
  return token
}

async function issueMcpToken({
  repositoryId,
  userId,
  label,
  expiresInDays,
  scopes,
  repositoryName,
  rotatedFromTokenId,
}: {
  repositoryId: string
  userId: string
  label: string
  expiresInDays?: 7 | 30 | 90
  scopes?: string[]
  repositoryName: string
  rotatedFromTokenId?: string | null
}) {
  const { rawToken, tokenHash, fingerprint } = createMcpTokenSecret()
  const normalizedScopes = normalizeMcpScopes(scopes)
  const expiresAt = resolveMcpTokenExpiry(expiresInDays)

  const [created] = await db
    .insert(mcpTokens)
    .values({
      repositoryId,
      userId,
      tokenHash,
      fingerprint,
      label,
      scopes: normalizedScopes,
      expiresAt,
      rotatedFromTokenId: rotatedFromTokenId ?? null,
    })
    .returning()

  const owner = await getMcpTokenOwner(userId)

  return {
    token: rawToken,
    tokenDetails: serializeMcpToken({ ...created, owner }),
    ...buildMcpTokenConfig({ tokenId: created.id, label, repositoryName, rawToken }),
  }
}

repositoryRoutes.post('/:id/mcp-tokens', async (c) => {
  const userId = c.get('userId')
  const repositoryId = c.req.param('id')
  await assertRepoAccess(userId, repositoryId)
  const repositoryName = await getRepositoryNameForMcpConfig(repositoryId)
  const body = createTokenSchema.parse(await c.req.json())

  return c.json(
    await issueMcpToken({
      repositoryId,
      userId,
      label: body.label,
      expiresInDays: body.expiresInDays,
      scopes: body.scopes,
      repositoryName,
    }),
    201,
  )
})

repositoryRoutes.get('/:id/mcp-tokens', async (c) => {
  const userId = c.get('userId')
  const repositoryId = c.req.param('id')
  await assertRepoAccess(userId, repositoryId)
  const { userId: ownerUserId } = mcpTokenOwnerFilterSchema.parse({
    userId: c.req.query('userId') || undefined,
  })
  const isRepositoryAdmin = await getIsRepositoryAdmin(userId)
  const selectedOwnerUserId = isRepositoryAdmin ? ownerUserId : userId
  const tokenOwnerFilter = selectedOwnerUserId
    ? eq(mcpTokens.userId, selectedOwnerUserId)
    : undefined
  const tokenListWhere = tokenOwnerFilter
    ? and(eq(mcpTokens.repositoryId, repositoryId), tokenOwnerFilter)
    : eq(mcpTokens.repositoryId, repositoryId)

  const tokens = await db
    .select({
      id: mcpTokens.id,
      label: mcpTokens.label,
      fingerprint: mcpTokens.fingerprint,
      scopes: mcpTokens.scopes,
      expiresAt: mcpTokens.expiresAt,
      revokedAt: mcpTokens.revokedAt,
      revokedReason: mcpTokens.revokedReason,
      lastUsedAt: mcpTokens.lastUsedAt,
      lastUsedIp: mcpTokens.lastUsedIp,
      lastUsedUserAgent: mcpTokens.lastUsedUserAgent,
      lastUsedClientName: mcpTokens.lastUsedClientName,
      lastUsedToolName: mcpTokens.lastUsedToolName,
      createdAt: mcpTokens.createdAt,
      ownerUserId: users.id,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(mcpTokens)
    .innerJoin(users, eq(mcpTokens.userId, users.id))
    .where(tokenListWhere)

  const ownerOptions = isRepositoryAdmin
    ? await db
        .selectDistinct({
          id: users.id,
          name: users.name,
          email: users.email,
        })
        .from(mcpTokens)
        .innerJoin(users, eq(mcpTokens.userId, users.id))
        .where(eq(mcpTokens.repositoryId, repositoryId))
    : []

  const tokensWithAlerts = await Promise.all(
    tokens.map(async (token) => {
      const alerts = await db
        .select({ id: mcpTokenAlerts.id })
        .from(mcpTokenAlerts)
        .where(and(eq(mcpTokenAlerts.tokenId, token.id), eq(mcpTokenAlerts.status, 'open')))
      return serializeMcpToken({
        ...token,
        alertCount: alerts.length,
        owner: {
          id: token.ownerUserId,
          name: token.ownerName,
          email: token.ownerEmail,
        },
      })
    }),
  )

  return c.json({ tokens: tokensWithAlerts, ownerOptions })
})

repositoryRoutes.delete('/:id/mcp-tokens/:tokenId', async (c) => {
  const userId = c.get('userId')
  const repositoryId = c.req.param('id')
  await assertRepoAccess(userId, repositoryId)
  const tokenId = c.req.param('tokenId')
  const isRepositoryAdmin = await getIsRepositoryAdmin(userId)

  const [revoked] = await db
    .update(mcpTokens)
    .set({ revokedAt: new Date(), revokedReason: 'user_revoke' })
    .where(
      and(
        eq(mcpTokens.id, tokenId),
        eq(mcpTokens.repositoryId, repositoryId),
        isRepositoryAdmin ? undefined : eq(mcpTokens.userId, userId),
        isNull(mcpTokens.revokedAt),
      ),
    )
    .returning()

  if (!revoked) throw new NotFoundError('MCP token')

  return c.body(null, 204)
})

repositoryRoutes.post('/:id/mcp-tokens/:tokenId/renew', async (c) => {
  const userId = c.get('userId')
  const repositoryId = c.req.param('id')
  await assertRepoAccess(userId, repositoryId)
  const tokenId = c.req.param('tokenId')
  const token = await assertOwnedMcpToken(userId, repositoryId, tokenId)
  const repositoryName = await getRepositoryNameForMcpConfig(repositoryId)

  const renewed = await issueMcpToken({
    repositoryId,
    userId,
    label: token.label,
    scopes: token.scopes,
    expiresInDays: 30,
    repositoryName,
    rotatedFromTokenId: token.id,
  })

  await db
    .update(mcpTokens)
    .set({ revokedAt: new Date(), revokedReason: 'rotated' })
    .where(and(eq(mcpTokens.id, token.id), isNull(mcpTokens.revokedAt)))

  return c.json(renewed, 201)
})

repositoryRoutes.post('/:id/mcp-tokens/:tokenId/test', async (c) => {
  const userId = c.get('userId')
  const repositoryId = c.req.param('id')
  await assertRepoAccess(userId, repositoryId)
  const tokenId = c.req.param('tokenId')
  const body = testMcpConnectionSchema.parse((await c.req.json().catch(() => ({}))) ?? {})

  const token = await db.query.mcpTokens.findFirst({
    where: and(
      eq(mcpTokens.id, tokenId),
      eq(mcpTokens.repositoryId, repositoryId),
      eq(mcpTokens.userId, userId),
    ),
  })

  if (!token) throw new NotFoundError('MCP token')

  const repositoryName = await getRepositoryNameForMcpConfig(repositoryId)
  const { mcpEndpoint } = buildMcpTokenConfig({
    tokenId: token.id,
    label: token.label,
    repositoryName,
  })
  const tokenScopes = normalizeMcpScopes(token.scopes)
  const expectedTools = expectedMcpToolsForScopes(tokenScopes)
  const blockReason = getMcpConnectionTestBlockReason(token)
  if (blockReason) {
    return c.json(
      summarizeMcpConnectionTest({
        endpoint: mcpEndpoint,
        latencyMs: 0,
        expectedTools,
        error: new Error(blockReason),
      }),
    )
  }

  let testToken = body.token
  let temporaryTokenId: string | null = null

  if (testToken) {
    const providedHash = hashMcpToken(testToken)
    if (providedHash !== token.tokenHash) {
      return c.json(
        summarizeMcpConnectionTest({
          endpoint: mcpEndpoint,
          latencyMs: 0,
          expectedTools,
          error: new Error('The provided token does not match this MCP token.'),
        }),
      )
    }
  } else {
    const secret = createMcpTokenSecret()
    testToken = secret.rawToken
    const [temporaryToken] = await db
      .insert(mcpTokens)
      .values({
        repositoryId,
        userId,
        tokenHash: secret.tokenHash,
        fingerprint: secret.fingerprint,
        scopes: tokenScopes,
        expiresAt: resolveMcpTokenExpiry(7),
        label: `connection-test-${Date.now()}`,
      })
      .returning({ id: mcpTokens.id })
    temporaryTokenId = temporaryToken.id
  }

  try {
    return c.json(
      await runMcpConnectionTest({ endpoint: mcpEndpoint, token: testToken, expectedTools }),
    )
  } finally {
    if (temporaryTokenId) {
      await db
        .delete(mcpTokens)
        .where(eq(mcpTokens.id, temporaryTokenId))
        .catch(() => undefined)
    }
  }
})

repositoryRoutes.get('/:id/mcp-tokens/:tokenId/config', async (c) => {
  const userId = c.get('userId')
  const repositoryId = c.req.param('id')
  await assertRepoAccess(userId, repositoryId)
  const tokenId = c.req.param('tokenId')

  const token = await db.query.mcpTokens.findFirst({
    where: and(
      eq(mcpTokens.id, tokenId),
      eq(mcpTokens.repositoryId, repositoryId),
      eq(mcpTokens.userId, userId),
    ),
  })

  if (!token) throw new NotFoundError('MCP token')

  const repositoryName = await getRepositoryNameForMcpConfig(repositoryId)

  return c.json(buildMcpTokenConfig({ tokenId: token.id, label: token.label, repositoryName }))
})

repositoryRoutes.get('/:id/mcp-tokens/:tokenId/audit', async (c) => {
  const userId = c.get('userId')
  const repositoryId = c.req.param('id')
  await assertRepoAccess(userId, repositoryId)
  const tokenId = c.req.param('tokenId')
  await assertAccessibleMcpToken(userId, repositoryId, tokenId)

  return c.json({ events: await listMcpTokenAuditEvents(tokenId) })
})

repositoryRoutes.get('/:id/mcp-tokens/:tokenId/alerts', async (c) => {
  const userId = c.get('userId')
  const repositoryId = c.req.param('id')
  await assertRepoAccess(userId, repositoryId)
  const tokenId = c.req.param('tokenId')
  await assertAccessibleMcpToken(userId, repositoryId, tokenId)

  return c.json({ alerts: await listOpenMcpTokenAlerts(tokenId) })
})

repositoryRoutes.post('/:id/mcp-tokens/:tokenId/alerts/:alertId/acknowledge', async (c) => {
  const userId = c.get('userId')
  const repositoryId = c.req.param('id')
  await assertRepoAccess(userId, repositoryId)
  const tokenId = c.req.param('tokenId')
  const alertId = c.req.param('alertId')
  await assertAccessibleMcpToken(userId, repositoryId, tokenId)

  const [updated] = await db
    .update(mcpTokenAlerts)
    .set({ status: 'acknowledged', acknowledgedAt: new Date() })
    .where(and(eq(mcpTokenAlerts.id, alertId), eq(mcpTokenAlerts.tokenId, tokenId)))
    .returning()

  if (!updated) throw new NotFoundError('MCP token alert')
  return c.json({ alert: updated })
})
