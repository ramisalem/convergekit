import { db, mcpTokens, repositories, user as users } from '@convergekit/db'
import { eq } from 'drizzle-orm'
import type { MiddlewareHandler } from 'hono'
import { UnauthorizedError } from '../errors.js'
import { hashMcpToken } from '../lib/mcp-token-policy.js'
import {
  clientIp,
  raiseMcpTokenAlert,
  recordMcpAuditEvent,
  type McpTokenContext,
} from '../lib/mcp-token-security.js'
import { checkRateLimit } from '../lib/rate-limit.js'
import { scopedRepositoryIds } from '../lib/scoping.js'

declare module 'hono' {
  interface ContextVariableMap {
    mcpToken: McpTokenContext
  }
}

/**
 * Validates the Bearer token on /api/mcp/* routes.
 *
 * Two static-token shapes:
 *  - user-level (repository_id NULL): owner active + user.ci_tokens_enabled.
 *  - grandfathered per-repo (repository_id set): owner active + repo not deleted +
 *    live repo-access (scopedRepositoryIds). No new per-repo tokens are created.
 *
 * Only mount behind requireMcpCredential (it converts these messages to a uniform 401).
 */
export const requireMcpToken: MiddlewareHandler = async (c, next) => {
  const authorization = c.req.header('Authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null

  if (!token) {
    throw new UnauthorizedError('MCP token required')
  }

  const tokenHash = hashMcpToken(token)

  const [row] = await db
    .select({
      token: mcpTokens,
      userDeactivatedAt: users.deactivatedAt,
      userCiEnabled: users.ciTokensEnabled,
      repositoryDeletedAt: repositories.deletedAt,
    })
    .from(mcpTokens)
    .innerJoin(users, eq(mcpTokens.userId, users.id))
    .leftJoin(repositories, eq(mcpTokens.repositoryId, repositories.id))
    .where(eq(mcpTokens.tokenHash, tokenHash))
    .limit(1)

  if (!row) {
    throw new UnauthorizedError('Invalid MCP token')
  }

  const mcpToken = row.token
  const now = new Date()

  if (mcpToken.revokedAt) {
    throw new UnauthorizedError('MCP token revoked')
  }

  if (mcpToken.expiresAt <= now) {
    throw new UnauthorizedError('MCP token expired')
  }

  if (row.userDeactivatedAt) {
    throw new UnauthorizedError('MCP token user is deactivated')
  }

  if (mcpToken.repositoryId === null) {
    // User-level CI token: gated by the owner's capability flag.
    if (row.userCiEnabled !== true) {
      throw new UnauthorizedError('MCP token capability is disabled')
    }
  } else {
    // Grandfathered per-repo token: owner must still have live access to the repo.
    if (row.repositoryDeletedAt) {
      throw new UnauthorizedError('MCP token repository was deleted')
    }

    const allowed = await scopedRepositoryIds(mcpToken.userId)
    if (!allowed.has(mcpToken.repositoryId)) {
      throw new UnauthorizedError('MCP token no longer has repository access')
    }
  }

  const tokenContext: McpTokenContext = {
    id: mcpToken.id,
    repositoryId: mcpToken.repositoryId,
    userId: mcpToken.userId,
    label: mcpToken.label,
    fingerprint: mcpToken.fingerprint,
    scopes: mcpToken.scopes,
    lastUsedIp: mcpToken.lastUsedIp,
    lastUsedUserAgent: mcpToken.lastUsedUserAgent,
    lastUsedClientName: mcpToken.lastUsedClientName,
    lastUsedToolName: mcpToken.lastUsedToolName,
  }

  const limits = [
    await checkRateLimit(mcpToken.id, 'mcp-token'),
    await checkRateLimit(mcpToken.userId, 'mcp-user'),
    ...(mcpToken.repositoryId ? [await checkRateLimit(mcpToken.repositoryId, 'mcp-repo')] : []),
  ]
  const denied = limits.find((limit) => !limit.allowed)
  if (denied) {
    await raiseMcpTokenAlert({
      token: tokenContext,
      kind: 'rate_limited',
      message: 'This token hit an MCP rate limit.',
      details: `retryAfterSeconds=${denied.retryAfterSeconds ?? 60}`,
    })
    await recordMcpAuditEvent({
      token: tokenContext,
      ipAddress: clientIp(c),
      userAgent: c.req.header('user-agent') ?? null,
      method: c.req.method,
      latencyMs: 0,
      status: 'rate_limited',
      statusCode: 429,
      errorCode: 'RATE_LIMITED',
    })
    return c.json({ error: 'Too Many Requests', code: 'RATE_LIMITED' }, 429, {
      'Retry-After': String(denied.retryAfterSeconds ?? 60),
    })
  }

  c.set('mcpToken', tokenContext)

  return next()
}
