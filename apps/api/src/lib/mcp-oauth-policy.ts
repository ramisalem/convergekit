import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { ALL_MCP_SCOPES, filterMcpScopes } from './mcp-token-policy.js'

export { filterMcpScopes }

export const OAUTH_BASE_SCOPES = ['openid', 'profile', 'email', 'offline_access'] as const
// Repo scopes come from the single source of truth in mcp-token-policy.
export const CANONICAL_OAUTH_SCOPES = [...OAUTH_BASE_SCOPES, ...ALL_MCP_SCOPES]
export const OAUTH_SCOPE_STRING = CANONICAL_OAUTH_SCOPES.join(' ')

export const OAUTH_ACCESS_TOKEN_TTL_MS = 30 * 60 * 1000
export const OAUTH_ABSOLUTE_REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000
export const OAUTH_AUTH_CODE_TTL_MS = 10 * 60 * 1000

export function hashOAuthToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('hex')
}

export function newTokenFamilyId(): string {
  return randomUUID()
}

export function computeAccessTokenExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + OAUTH_ACCESS_TOKEN_TTL_MS)
}

export function computeAbsoluteExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + OAUTH_ABSOLUTE_REFRESH_TTL_MS)
}

export function computeAuthCodeExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + OAUTH_AUTH_CODE_TTL_MS)
}

export function pkceVerify(verifier: string, challenge: string, method: string): boolean {
  const normalized = method.toLowerCase()
  if (normalized === 'plain') return verifier === challenge
  if (normalized === 's256') {
    return createHash('sha256').update(verifier).digest('base64url') === challenge
  }
  return false
}

export type AccessDecision = 'valid' | 'revoked' | 'expired'

export function evaluateAccessToken(
  token: { revokedAt: Date | null; accessTokenExpiresAt: Date },
  now: Date = new Date(),
): AccessDecision {
  if (token.revokedAt) return 'revoked'
  if (token.accessTokenExpiresAt <= now) return 'expired'
  return 'valid'
}

export type RefreshDecision = 'rotate' | 'expired' | 'absolute_expired' | 'reuse_detected'

/**
 * Decide what to do with a presented refresh token, given the grant row it
 * matched. Order matters: a row that is already revoked means the token was
 * rotated away and is being replayed -> reuse, which the caller must escalate
 * to revoking the whole `family_id`. Otherwise the absolute cap wins over the
 * per-token expiry.
 */
export function classifyRefresh(
  grant: {
    revokedAt: Date | null
    refreshTokenExpiresAt: Date | null
    absoluteExpiresAt: Date
  },
  now: Date = new Date(),
): RefreshDecision {
  if (grant.revokedAt) return 'reuse_detected'
  if (grant.absoluteExpiresAt <= now) return 'absolute_expired'
  if (!grant.refreshTokenExpiresAt || grant.refreshTokenExpiresAt <= now) return 'expired'
  return 'rotate'
}
