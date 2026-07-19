import { resolveMcpOAuthConfig } from '@convergekit/config/mcp-oauth'
import { db, user as users } from '@convergekit/db'
import { eq } from 'drizzle-orm'
import type { Context, MiddlewareHandler } from 'hono'
import { UnauthorizedError } from '../errors.js'
import { validateAccessToken } from '../lib/mcp-oauth-store.js'
import type { McpScope } from '../lib/mcp-token-policy.js'
import { recordOAuthMcpAuditEvent } from '../lib/mcp-token-security.js'
import { checkRateLimit } from '../lib/rate-limit.js'
import { requireMcpToken } from './require-mcp-token.js'

const config = resolveMcpOAuthConfig(process.env)

export type McpPrincipal =
  | {
      kind: 'static'
      userId: string
      mcpTokenId: string
      repositoryId: string | null
      scopes: McpScope[]
    }
  | { kind: 'oauth'; userId: string; clientId: string; oauthTokenId: string; scopes: McpScope[] }

declare module 'hono' {
  interface ContextVariableMap {
    mcpPrincipal: McpPrincipal
  }
}

function unauthorizedWithDiscovery(c: Context) {
  const headers: Record<string, string> = { 'WWW-Authenticate': 'Bearer' }
  if (config.enabled && config.resourceUrl) {
    headers['WWW-Authenticate'] =
      `Bearer resource_metadata="${config.issuerUrl}/.well-known/oauth-protected-resource"`
  }
  return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401, headers)
}

export const requireMcpCredential: MiddlewareHandler = async (c, next) => {
  const authorization = c.req.header('Authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
  if (!token) return unauthorizedWithDiscovery(c)

  // ── OAuth path ──
  if (config.enabled) {
    const principal = await validateAccessToken(token)
    if (principal) {
      const [u] = await db
        .select({ deactivatedAt: users.deactivatedAt })
        .from(users)
        .where(eq(users.id, principal.userId))
        .limit(1)
      if (!u || u.deactivatedAt) return unauthorizedWithDiscovery(c)

      const limited = [
        await checkRateLimit(principal.oauthTokenId, 'mcp-token'),
        await checkRateLimit(principal.userId, 'mcp-user'),
      ].find((l) => !l.allowed)
      if (limited) {
        // Audit parity with the static path, which records a rate_limited event on 429.
        await recordOAuthMcpAuditEvent({
          oauthTokenId: principal.oauthTokenId,
          userId: principal.userId,
          clientId: principal.clientId,
          method: c.req.method,
          latencyMs: 0,
          status: 'rate_limited',
          statusCode: 429,
          errorCode: 'RATE_LIMITED',
        })
        return c.json({ error: 'Too Many Requests', code: 'RATE_LIMITED' }, 429, {
          'Retry-After': String(limited.retryAfterSeconds ?? 60),
        })
      }

      c.set('mcpPrincipal', { kind: 'oauth', ...principal })
      return next()
    }
  }

  // ── Static fallback: reuse the unchanged hardened middleware ──
  try {
    return await requireMcpToken(c, async () => {
      const staticToken = c.get('mcpToken')
      c.set('mcpPrincipal', {
        kind: 'static',
        userId: staticToken.userId,
        mcpTokenId: staticToken.id,
        repositoryId: staticToken.repositoryId,
        scopes: staticToken.scopes as McpScope[],
      })
      return next()
    })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedWithDiscovery(c)
    throw err
  }
}
