import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  CANONICAL_OAUTH_SCOPES,
  OAUTH_ACCESS_TOKEN_TTL_MS,
  OAUTH_ABSOLUTE_REFRESH_TTL_MS,
  OAUTH_SCOPE_STRING,
  computeAbsoluteExpiry,
  computeAccessTokenExpiry,
  filterMcpScopes,
  generateOpaqueToken,
  hashOAuthToken,
  newTokenFamilyId,
  pkceVerify,
} from './mcp-oauth-policy.js'
import { classifyRefresh, evaluateAccessToken } from './mcp-oauth-policy.js'

describe('mcp-oauth-policy crypto + constants', () => {
  it('canonical scope string includes offline_access (required for refresh) and the repo scopes', () => {
    expect(OAUTH_SCOPE_STRING).toBe('openid profile email offline_access repo:read docs:search files:read')
    expect(CANONICAL_OAUTH_SCOPES).toContain('offline_access')
  })

  it('filterMcpScopes (single source of truth, reused from mcp-token-policy) keeps only the three repo scopes', () => {
    expect(filterMcpScopes(['openid', 'repo:read', 'files:read', 'bogus'])).toEqual([
      'repo:read',
      'files:read',
    ])
  })

  it('hashOAuthToken is a stable 64-char sha256 hex and not the raw token', () => {
    const raw = 'tok_example'
    const hash = hashOAuthToken(raw)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toBe(raw)
    expect(hashOAuthToken(raw)).toBe(hash)
  })

  it('generateOpaqueToken returns unique high-entropy hex and family ids are uuids', () => {
    const a = generateOpaqueToken()
    const b = generateOpaqueToken()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
    expect(newTokenFamilyId()).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('computes a 30-minute access expiry and a 60-day absolute expiry from now', () => {
    const now = new Date('2026-06-10T00:00:00.000Z')
    expect(computeAccessTokenExpiry(now).getTime()).toBe(now.getTime() + OAUTH_ACCESS_TOKEN_TTL_MS)
    expect(computeAbsoluteExpiry(now).getTime()).toBe(now.getTime() + OAUTH_ABSOLUTE_REFRESH_TTL_MS)
    expect(OAUTH_ACCESS_TOKEN_TTL_MS).toBe(30 * 60 * 1000)
    expect(OAUTH_ABSOLUTE_REFRESH_TTL_MS).toBe(60 * 24 * 60 * 60 * 1000)
  })

  it('verifies PKCE S256 and plain, rejecting wrong verifiers and unknown methods', () => {
    // S256 challenge for verifier "abc123" = base64url(sha256("abc123"))
    const verifier = 'abc123'
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    expect(pkceVerify(verifier, challenge, 'S256')).toBe(true)
    expect(pkceVerify(verifier, challenge, 's256')).toBe(true)
    expect(pkceVerify('wrong', challenge, 'S256')).toBe(false)
    expect(pkceVerify('plainval', 'plainval', 'plain')).toBe(true)
    expect(pkceVerify('x', 'x', 'unknown')).toBe(false)
  })
})

describe('mcp-oauth-policy decisions', () => {
  const now = new Date('2026-06-10T12:00:00.000Z')
  const future = new Date(now.getTime() + 60_000)
  const past = new Date(now.getTime() - 60_000)

  it('access token is valid only when not revoked and not expired', () => {
    expect(evaluateAccessToken({ revokedAt: null, accessTokenExpiresAt: future }, now)).toBe('valid')
    expect(evaluateAccessToken({ revokedAt: null, accessTokenExpiresAt: past }, now)).toBe('expired')
    expect(evaluateAccessToken({ revokedAt: now, accessTokenExpiresAt: future }, now)).toBe('revoked')
  })

  it('rotates a live refresh token', () => {
    expect(
      classifyRefresh(
        { revokedAt: null, refreshTokenExpiresAt: future, absoluteExpiresAt: future },
        now,
      ),
    ).toBe('rotate')
  })

  it('flags a presented-but-already-revoked refresh token as reuse (family must be revoked)', () => {
    expect(
      classifyRefresh(
        { revokedAt: past, refreshTokenExpiresAt: future, absoluteExpiresAt: future },
        now,
      ),
    ).toBe('reuse_detected')
  })

  it('enforces the 60-day absolute cap before the per-token expiry', () => {
    expect(
      classifyRefresh(
        { revokedAt: null, refreshTokenExpiresAt: future, absoluteExpiresAt: past },
        now,
      ),
    ).toBe('absolute_expired')
  })

  it('treats a missing or expired per-token refresh expiry as expired', () => {
    expect(
      classifyRefresh(
        { revokedAt: null, refreshTokenExpiresAt: past, absoluteExpiresAt: future },
        now,
      ),
    ).toBe('expired')
    expect(
      classifyRefresh(
        { revokedAt: null, refreshTokenExpiresAt: null, absoluteExpiresAt: future },
        now,
      ),
    ).toBe('expired')
  })
})
