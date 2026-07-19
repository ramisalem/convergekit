import { db, mcpTokenAlerts, mcpTokens, repositories, user as users } from '@convergekit/db'
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { NotFoundError, ValidationError } from '../errors.js'
import {
  assertAnyCiToken,
  assertCiToken,
  ciTokenColumns,
  getOpenAlertCountsByToken,
  serializeCiToken,
  serializeLegacyCiToken,
} from '../lib/ci-token-service.js'
import { buildMcpTokenConfig } from '../lib/mcp-config.js'
import { listMcpTokenAuditEvents, listOpenMcpTokenAlerts } from '../lib/mcp-token-security.js'

export const ciTokenRoutes = new Hono()

// `/admin/*` is already gated by requireAuth + requireAdmin in app.ts — do NOT
// re-apply auth here. `c.get('userId')` is therefore always an admin.
//
// This router is oversight-only: minting, rotation, and connection-testing are
// self-service, via the shared helpers in ../lib/ci-token-service.js mounted at
// /api/me/ci-tokens (me-ci-tokens.ts) — including for admins acting on their own
// tokens. Here, admins may list, inspect, and revoke tokens belonging to anyone,
// across both shapes: user-level (repository_id IS NULL) and legacy repo-scoped
// (repository_id IS NOT NULL, grandfathered, revoke/inspect-only).

ciTokenRoutes.get('/', async (c) => {
  const tokens = await db
    .select({
      ...ciTokenColumns,
      ownerUserId: users.id,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(mcpTokens)
    .innerJoin(users, eq(mcpTokens.userId, users.id))
    .where(isNull(mcpTokens.repositoryId))
    .orderBy(desc(mcpTokens.createdAt))

  const alertCountByToken = await getOpenAlertCountsByToken(tokens.map((token) => token.id))

  const tokensWithAlerts = tokens.map((token) =>
    serializeCiToken({
      ...token,
      alertCount: alertCountByToken.get(token.id) ?? 0,
      owner: { id: token.ownerUserId, name: token.ownerName, email: token.ownerEmail },
    }),
  )

  return c.json({ tokens: tokensWithAlerts })
})

ciTokenRoutes.get('/legacy', async (c) => {
  const tokens = await db
    .select({
      ...ciTokenColumns,
      repositoryId: repositories.id,
      repositoryName: repositories.name,
      repositoryDeletedAt: repositories.deletedAt,
      ownerUserId: users.id,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(mcpTokens)
    .innerJoin(repositories, eq(mcpTokens.repositoryId, repositories.id))
    .innerJoin(users, eq(mcpTokens.userId, users.id))
    .where(isNotNull(mcpTokens.repositoryId))
    .orderBy(desc(mcpTokens.createdAt))

  const alertCountByToken = await getOpenAlertCountsByToken(tokens.map((token) => token.id))

  const tokensWithAlerts = tokens.map((token) =>
    serializeLegacyCiToken({
      ...token,
      alertCount: alertCountByToken.get(token.id) ?? 0,
      repository: {
        id: token.repositoryId,
        name: token.repositoryName,
        deletedAt: token.repositoryDeletedAt, // oversight must see active tokens on soft-deleted repos
      },
      owner: { id: token.ownerUserId, name: token.ownerName, email: token.ownerEmail },
    }),
  )

  return c.json({ tokens: tokensWithAlerts })
})

ciTokenRoutes.delete('/legacy/:tokenId', async (c) => {
  const tokenId = c.req.param('tokenId')

  // Guarded single UPDATE, scoped to legacy rows only — mirrors the user-level
  // revoke-any below. isNotNull(repositoryId) means this can never revoke a
  // user-level row, no matter which id is passed.
  const [revoked] = await db
    .update(mcpTokens)
    .set({ revokedAt: new Date(), revokedReason: 'admin_revoke' })
    .where(
      and(
        eq(mcpTokens.id, tokenId),
        isNotNull(mcpTokens.repositoryId),
        isNull(mcpTokens.revokedAt),
      ),
    )
    .returning()

  if (!revoked) throw new NotFoundError('CI token')

  return c.body(null, 204)
})

ciTokenRoutes.get('/:tokenId/config', async (c) => {
  const token = await assertCiToken(c.req.param('tokenId'))
  // No rawToken here: the config carries a <paste-your-token-here> placeholder,
  // so any admin may view it. User-level only: a legacy repo-scoped token's
  // config block is the old repo-scoped shape, and oversight doesn't reissue it.
  return c.json(buildMcpTokenConfig({ tokenId: token.id, label: token.label }))
})

ciTokenRoutes.get('/:tokenId/audit', async (c) => {
  const token = await assertAnyCiToken(c.req.param('tokenId'))
  return c.json({ events: await listMcpTokenAuditEvents(token.id) })
})

ciTokenRoutes.get('/:tokenId/alerts', async (c) => {
  const token = await assertAnyCiToken(c.req.param('tokenId'))
  return c.json({ alerts: await listOpenMcpTokenAlerts(token.id) })
})

ciTokenRoutes.post('/:tokenId/alerts/:alertId/acknowledge', async (c) => {
  const token = await assertAnyCiToken(c.req.param('tokenId'))
  const alertId = c.req.param('alertId')

  const [updated] = await db
    .update(mcpTokenAlerts)
    .set({ status: 'acknowledged', acknowledgedAt: new Date() })
    .where(and(eq(mcpTokenAlerts.id, alertId), eq(mcpTokenAlerts.tokenId, token.id)))
    .returning()

  if (!updated) throw new NotFoundError('CI token alert')
  return c.json({ alert: updated })
})

ciTokenRoutes.delete('/:tokenId', async (c) => {
  const userId = c.get('userId')
  const tokenId = c.req.param('tokenId')
  const token = await assertAnyCiToken(tokenId)
  if (token.repositoryId !== null) {
    // Admins can already see both shapes in their lists, so naming the right
    // endpoint leaks nothing and saves incident-response time vs a bare 404.
    throw new ValidationError(
      'Legacy per-repo token — revoke it via DELETE /api/admin/ci-tokens/legacy/:tokenId',
    )
  }
  const isOwnToken = token.userId === userId

  const [revoked] = await db
    .update(mcpTokens)
    .set({ revokedAt: new Date(), revokedReason: isOwnToken ? 'user_revoke' : 'admin_revoke' })
    .where(
      and(
        eq(mcpTokens.id, tokenId),
        isNull(mcpTokens.repositoryId), // shape pinned in the WHERE itself, mirroring the legacy delete
        isNull(mcpTokens.revokedAt),
      ),
    )
    .returning()

  if (!revoked) throw new NotFoundError('CI token')

  return c.body(null, 204)
})
