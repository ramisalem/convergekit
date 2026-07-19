import { accessPolicyConfig, assertAllowedAccessPolicyRepository } from '@convergekit/config/access-policy'
import {
  account,
  branches,
  createIndexingRun,
  db,
  documents,
  getActiveIncrementalRun,
  getIncrementalIndexingSummaries,
  getUserAiSettings,
  listIndexingRuns,
  pauseBranchIncrementalIndexing,
  performIncrementalCheck,
  redactUrlCredentials,
  repositories,
  resetBranchIndexState,
  resumeBranchIncrementalIndexing,
  supersedeActiveIncrementalRuns,
  updateIndexingRun,
  updateRepositoryStatus,
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
import { simpleGit } from 'simple-git'
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
import { serializeIndexingRunForResponse } from '../lib/incremental-indexing-response.js'
import { revokeActiveMcpTokensForRepository } from '../lib/mcp-token-security.js'
import { getRepositoryGuideSummary } from '../lib/repo-guide.js'
import { getLatestRepositoryIndexingFailure } from '../lib/repository-indexing-failure.js'
import {
  attachRepositoryListSummaries,
  getRepositoryListSummaries,
} from '../lib/repository-list-summary.js'
import { serializeRepositoryForResponse } from '../lib/repository-response.js'
import { assertRepoAccess, assertRepoAdminAction, scopedRepositoryIds } from '../lib/scoping.js'

export const repositoryRoutes = new Hono()
const MINDMAP_PATH = '__mindmap__'

type RepositoryRecord = typeof repositories.$inferSelect

function parseScopes(scope: string | null | undefined): Set<string> {
  if (!scope) return new Set()
  return new Set(
    scope
      .split(/[,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean),
  )
}

function buildAuthenticatedCloneUrl(cloneUrl: string, token: string): string {
  const parsed = new URL(cloneUrl)
  parsed.username = 'x-oauth-token'
  parsed.password = token
  return parsed.toString()
}

async function resolveRepositoryAnalysisCloneUrl(repo: RepositoryRecord): Promise<string | null> {
  if (repo.provider !== 'github' || !repo.isPrivate) {
    return repo.cloneUrl
  }

  const githubAccount = await db.query.account.findFirst({
    where: and(eq(account.userId, repo.userId), eq(account.providerId, 'github')),
  })

  if (!githubAccount?.accessToken) return null

  return buildAuthenticatedCloneUrl(repo.cloneUrl, githubAccount.accessToken)
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
      cloneUrl = buildAuthenticatedCloneUrl(cloneUrl, token)
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

  const summaries = await getRepositoryListSummaries([...allowed])
  const incremental = await getIncrementalIndexingSummaries([...allowed])
  return c.json({
    repositories: attachRepositoryListSummaries(
      repos.map(serializeRepositoryForResponse),
      summaries,
    ).map((repo) => ({ ...repo, incrementalIndexing: incremental.get(repo.id) ?? undefined })),
  })
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

  if (!hasReadOrgScope) {
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
      warning: `Unable to load ${accessPolicyConfig.allowedGitHubOrg} repositories. Complete GitHub SSO authorization and try again.`,
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
  const indexingFailure =
    repo.status === 'failed' ? await getLatestRepositoryIndexingFailure(id) : null
  const incrementalSummaries = await getIncrementalIndexingSummaries([id])

  return c.json({
    repository: {
      ...serializeRepositoryForResponse(repo),
      indexedAt: state.branch?.lastIndexedAt?.toISOString() ?? null,
      incrementalIndexing: incrementalSummaries.get(id) ?? undefined,
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
      indexingFailure,
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

  const cloneUrl = await resolveRepositoryAnalysisCloneUrl(repo)
  if (!cloneUrl) {
    return c.json({ error: 'Reconnect GitHub to re-index this repository.' }, 403)
  }

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

  // A full re-index supersedes any in-flight incremental work: flip active runs
  // so the worker stale-guard aborts branch advancement.
  await supersedeActiveIncrementalRuns(
    branch.id,
    'Superseded by a full re-index started from Advanced Settings.',
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
    cloneUrl,
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

// ─── Incremental indexing controls (admin only) ───────────────────────────────

async function loadRepositoryBranchForIncremental(id: string) {
  const repo = await db.query.repositories.findFirst({
    where: and(eq(repositories.id, id), isNull(repositories.deletedAt)),
  })
  if (!repo) throw new NotFoundError('Repository')
  const branch = await db.query.branches.findFirst({ where: eq(branches.repositoryId, id) })
  if (!branch) throw new NotFoundError('Branch')
  return { repo, branch }
}

repositoryRoutes.post('/:id/incremental-indexing/check-now', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  await assertRepoAdminAction(userId, id)
  const { repo, branch } = await loadRepositoryBranchForIncremental(id)

  if (!branch.lastIndexedAt) {
    return c.json({ error: 'Run a full index before checking for incremental changes.' }, 400)
  }

  const cloneUrl = await resolveRepositoryAnalysisCloneUrl(repo)
  if (!cloneUrl) {
    return c.json({ error: 'Reconnect GitHub to check this repository.' }, 403)
  }

  const result = await performIncrementalCheck(
    {
      getActiveIncrementalRun,
      resolveRemoteHead: async ({ branchName }) => {
        // Exact ref-equality (mirrors the worker's parseLsRemoteHead — Decision
        // §11), not endsWith, so e.g. `feature/main` cannot shadow `main`.
        let output: string
        try {
          output = await simpleGit().listRemote(['--heads', cloneUrl, branchName])
        } catch (err) {
          // Redact the credentialed clone URL embedded in simple-git's error
          // before it can reach the request error log.
          throw new Error(redactUrlCredentials(err instanceof Error ? err.message : String(err)))
        }
        const wanted = `refs/heads/${branchName}`
        const sha = output
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => line.split('\t'))
          .find(([, ref]) => ref?.trim() === wanted)?.[0]
          ?.trim()
        if (!sha) throw new Error(`Remote branch ${branchName} not found`)
        return sha
      },
      createIndexingRun,
      updateIndexingRun,
      enqueueIncremental: async (input) => {
        const job = await incrementalQueue.add('sync', {
          repositoryId: input.repositoryId,
          branchId: input.branchId,
          fromCommit: input.fromCommit,
          toCommit: input.toCommit,
          runId: input.runId,
          trigger: input.trigger,
        })
        return { queueName: QUEUE_NAMES.INCREMENTAL_UPDATE, jobId: String(job.id) }
      },
    },
    {
      repositoryId: id,
      branchId: branch.id,
      branchName: branch.name,
      trigger: 'manual',
      lastIndexedAt: branch.lastIndexedAt,
      enabled: branch.incrementalIndexingEnabled,
      indexedCommitSha: branch.indexedCommitSha,
    },
  )

  const incremental = await getIncrementalIndexingSummaries([id])
  return c.json({ outcome: result.outcome, incrementalIndexing: incremental.get(id) ?? null }, 202)
})

repositoryRoutes.post('/:id/incremental-indexing/pause', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  await assertRepoAdminAction(userId, id)
  const { branch } = await loadRepositoryBranchForIncremental(id)
  await pauseBranchIncrementalIndexing(branch.id, userId)
  const incremental = await getIncrementalIndexingSummaries([id])
  return c.json({ incrementalIndexing: incremental.get(id) ?? null })
})

repositoryRoutes.post('/:id/incremental-indexing/resume', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  await assertRepoAdminAction(userId, id)
  const { branch } = await loadRepositoryBranchForIncremental(id)
  await resumeBranchIncrementalIndexing(branch.id)
  const incremental = await getIncrementalIndexingSummaries([id])
  return c.json({ incrementalIndexing: incremental.get(id) ?? null })
})

repositoryRoutes.get('/:id/incremental-indexing/runs', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  await assertRepoAdminAction(userId, id)
  const limitParam = Number.parseInt(c.req.query('limit') ?? '10', 10)
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 10
  const runs = await listIndexingRuns(id, limit)
  return c.json({ runs: runs.map(serializeIndexingRunForResponse) })
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
