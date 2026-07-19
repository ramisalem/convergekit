import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./mcp-oauth-store.ts', import.meta.url), 'utf8')

describe('mcp-oauth-store contract', () => {
  it('hashes codes and tokens, never storing raw values', () => {
    expect(source).toContain('hashOAuthToken')
    expect(source).not.toMatch(/accessTokenHash:\s*accessToken\b/)
  })

  it('verifies PKCE and single-use-consumes the authorization code', () => {
    expect(source).toContain('pkceVerify')
    expect(source).toContain('consumedAt')
  })

  it('delegates refresh decisions to classifyRefresh', () => {
    expect(source).toContain('classifyRefresh')
    expect(source).toContain("case 'reuse_detected'")
    expect(source).toContain("case 'rotate'")
  })

  it('on rotation revokes the old row but retains its refresh hash (reuse detection depends on it)', () => {
    expect(source).toContain('revokedAt: new Date()')
    expect(source).not.toContain('refreshTokenHash: null')
  })

  it('claims the rotated row atomically (compare-and-swap on still-un-revoked)', () => {
    // The rotate path must only revoke + issue if it claims a row that is still
    // un-revoked, so two concurrent refreshes cannot both succeed (double-issue race).
    expect(source).toContain('and(eq(mcpOauthToken.id, row.id), isNull(mcpOauthToken.revokedAt))')
    expect(source).toContain('if (claimed.length === 0)')
  })

  it('on reuse revokes the whole family', () => {
    expect(source).toContain('revokeFamily')
    expect(source).toContain('eq(mcpOauthToken.familyId')
  })

  it('validates access tokens via evaluateAccessToken and loads the user for deactivation checks elsewhere', () => {
    expect(source).toContain('evaluateAccessToken')
  })
})
