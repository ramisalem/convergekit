import { db, mcpTokenAlerts, mcpTokens, repositories } from '@convergekit/db'
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { ForbiddenError, NotFoundError } from '../errors.js'
import {
  assertOwnedCiToken,
  ciTokenColumns,
  createCiTokenSchema,
  createUserLevelToken,
  getCiTokenOwner,
  getOpenAlertCountsByToken,
  renewUserLevelToken,
  serializeCiToken,
  serializeLegacyCiToken,
  testCiConnectionSchema,
} from '../lib/ci-token-service.js'
import { buildMcpTokenConfig } from '../lib/mcp-config.js'
import { runMcpConnectionTest, summarizeMcpConnectionTest } from '../lib/mcp-connection-test.js'
import {
  createMcpTokenSecret,
  expectedMcpToolsForScopes,
  getMcpConnectionTestBlockReason,
  hashMcpToken,
  normalizeMcpScopes,
} from '../lib/mcp-token-policy.js'
import { listMcpTokenAuditEvents, listOpenMcpTokenAlerts } from '../lib/mcp-token-security.js'
import { logger } from '../logger.js'

export const meCiTokenRoutes = new Hono()

// `/me/*` is already gated by requireAuth in app.ts. Every route below scopes to
// `c.get('userId')` — callers only ever see or mutate their own tokens.

meCiTokenRoutes.post('/ci-tokens', async (c) => {
  const userId = c.get('userId')
  const body = createCiTokenSchema.parse(await c.req.json().catch(() => ({})))

  // The row lock + capability re-check live in createUserLevelToken (ci-token-service.ts) —
  // this route just opens the transaction and delegates.
  const result = await db.transaction((tx) => createUserLevelToken(tx, { userId, ...body }))
  if (!result) throw new ForbiddenError('CI token capability is not enabled for your account')

  return c.json(result, 201)
})

meCiTokenRoutes.get('/ci-tokens', async (c) => {
  const userId = c.get('userId')

  const tokens = await db
    .select({ ...ciTokenColumns })
    .from(mcpTokens)
    .where(and(eq(mcpTokens.userId, userId), isNull(mcpTokens.repositoryId)))
    .orderBy(desc(mcpTokens.createdAt))

  const alertCountByToken = await getOpenAlertCountsByToken(tokens.map((token) => token.id))

  // Every row belongs to the same caller — resolve the owner once instead of joining per-row.
  const owner = await getCiTokenOwner(userId)

  const tokensWithAlerts = tokens.map((token) =>
    serializeCiToken({
      ...token,
      alertCount: alertCountByToken.get(token.id) ?? 0,
      owner,
    }),
  )

  return c.json({ tokens: tokensWithAlerts })
})

meCiTokenRoutes.get('/ci-tokens/legacy', async (c) => {
  const userId = c.get('userId')

  const tokens = await db
    .select({
      ...ciTokenColumns,
      repositoryId: repositories.id,
      repositoryName: repositories.name,
    })
    .from(mcpTokens)
    .innerJoin(repositories, eq(mcpTokens.repositoryId, repositories.id))
    .where(and(eq(mcpTokens.userId, userId), isNotNull(mcpTokens.repositoryId)))
    .orderBy(desc(mcpTokens.createdAt))

  // Legacy tokens still serve traffic and can raise alerts — the owner's own view
  // must not understate them (parity with the oversight list).
  const alertCountByToken = await getOpenAlertCountsByToken(tokens.map((token) => token.id))

  return c.json({
    tokens: tokens.map((token) =>
      serializeLegacyCiToken({
        ...token,
        alertCount: alertCountByToken.get(token.id) ?? 0,
        repository: { id: token.repositoryId, name: token.repositoryName },
      }),
    ),
  })
})

meCiTokenRoutes.delete('/ci-tokens/legacy/:tokenId', async (c) => {
  const userId = c.get('userId')
  const tokenId = c.req.param('tokenId')

  const [revoked] = await db
    .update(mcpTokens)
    .set({ revokedAt: new Date(), revokedReason: 'user_revoke' })
    .where(
      and(
        eq(mcpTokens.id, tokenId),
        eq(mcpTokens.userId, userId),
        isNotNull(mcpTokens.repositoryId),
        isNull(mcpTokens.revokedAt),
      ),
    )
    .returning()

  if (!revoked) throw new NotFoundError('CI token')
  return c.body(null, 204)
})

meCiTokenRoutes.get('/ci-tokens/:tokenId/config', async (c) => {
  const userId = c.get('userId')
  const token = await assertOwnedCiToken(userId, c.req.param('tokenId'))
  // No rawToken here: the config carries a <paste-your-token-here> placeholder.
  return c.json(buildMcpTokenConfig({ tokenId: token.id, label: token.label }))
})

meCiTokenRoutes.get('/ci-tokens/:tokenId/audit', async (c) => {
  const userId = c.get('userId')
  const token = await assertOwnedCiToken(userId, c.req.param('tokenId'))
  return c.json({ events: await listMcpTokenAuditEvents(token.id) })
})

meCiTokenRoutes.get('/ci-tokens/:tokenId/alerts', async (c) => {
  const userId = c.get('userId')
  const token = await assertOwnedCiToken(userId, c.req.param('tokenId'))
  return c.json({ alerts: await listOpenMcpTokenAlerts(token.id) })
})

meCiTokenRoutes.post('/ci-tokens/:tokenId/alerts/:alertId/acknowledge', async (c) => {
  const userId = c.get('userId')
  const token = await assertOwnedCiToken(userId, c.req.param('tokenId'))
  const alertId = c.req.param('alertId')

  const [updated] = await db
    .update(mcpTokenAlerts)
    .set({ status: 'acknowledged', acknowledgedAt: new Date() })
    .where(and(eq(mcpTokenAlerts.id, alertId), eq(mcpTokenAlerts.tokenId, token.id)))
    .returning()

  if (!updated) throw new NotFoundError('CI token alert')
  return c.json({ alert: updated })
})

meCiTokenRoutes.post('/ci-tokens/:tokenId/renew', async (c) => {
  const userId = c.get('userId')

  // The row lock + capability re-check live in renewUserLevelToken (ci-token-service.ts) —
  // this route just opens the transaction and delegates.
  const result = await db.transaction((tx) =>
    renewUserLevelToken(tx, { userId, tokenId: c.req.param('tokenId') }),
  )
  if (!result) throw new ForbiddenError('CI token capability is not enabled for your account')

  return c.json(result)
})

meCiTokenRoutes.post('/ci-tokens/:tokenId/test', async (c) => {
  const userId = c.get('userId')
  const tokenId = c.req.param('tokenId')
  const body = testCiConnectionSchema.parse((await c.req.json().catch(() => ({}))) ?? {})
  const token = await assertOwnedCiToken(userId, tokenId)

  const { mcpEndpoint } = buildMcpTokenConfig({ tokenId: token.id, label: token.label })
  const tokenScopes = normalizeMcpScopes(token.scopes)
  const expectedTools = ['list_repositories', ...expectedMcpToolsForScopes(tokenScopes)]
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
          error: new Error('The provided token does not match this CI token.'),
        }),
      )
    }
  } else {
    const secret = createMcpTokenSecret()
    testToken = secret.rawToken
    const [temporaryToken] = await db
      .insert(mcpTokens)
      .values({
        repositoryId: null,
        userId,
        tokenHash: secret.tokenHash,
        fingerprint: secret.fingerprint,
        scopes: tokenScopes,
        // Crash backstop: the finally-delete below is the primary cleanup, but if the
        // process dies mid-test this orphan must not stay a valid bearer for days.
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
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
        .catch((error) => {
          logger.warn(
            {
              tokenId: temporaryTokenId,
              error: error instanceof Error ? error.message : String(error),
            },
            'ci-token connection-test cleanup failed',
          )
        })
    }
  }
})

meCiTokenRoutes.delete('/ci-tokens/:tokenId', async (c) => {
  const userId = c.get('userId')
  const tokenId = c.req.param('tokenId')

  const [revoked] = await db
    .update(mcpTokens)
    .set({ revokedAt: new Date(), revokedReason: 'user_revoke' })
    .where(
      and(
        eq(mcpTokens.id, tokenId),
        eq(mcpTokens.userId, userId),
        isNull(mcpTokens.repositoryId),
        isNull(mcpTokens.revokedAt),
      ),
    )
    .returning()

  if (!revoked) throw new NotFoundError('CI token')
  return c.body(null, 204)
})
