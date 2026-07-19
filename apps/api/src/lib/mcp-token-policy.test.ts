import { describe, expect, it } from 'vitest'
import {
  ALL_MCP_SCOPES,
  createMcpTokenSecret,
  expectedMcpToolsForScopes,
  fingerprintMcpTokenHash,
  getMcpConnectionTestBlockReason,
  getMcpTokenStatus,
  normalizeMcpScopes,
  resolveMcpTokenExpiry,
} from './mcp-token-policy.js'

describe('MCP token policy', () => {
  it('defaults new tokens to 30 days and all read scopes', () => {
    const now = new Date('2026-04-28T00:00:00.000Z')

    expect(resolveMcpTokenExpiry(undefined, now).toISOString()).toBe('2026-05-28T00:00:00.000Z')
    expect(normalizeMcpScopes(undefined)).toEqual(ALL_MCP_SCOPES)
  })

  it('only accepts the supported expiry windows', () => {
    const now = new Date('2026-04-28T00:00:00.000Z')

    expect(resolveMcpTokenExpiry(7, now).toISOString()).toBe('2026-05-05T00:00:00.000Z')
    expect(resolveMcpTokenExpiry(90, now).toISOString()).toBe('2026-07-27T00:00:00.000Z')
    expect(() => resolveMcpTokenExpiry(14, now)).toThrow('Unsupported MCP token expiry')
  })

  it('deduplicates scopes and rejects unsupported scopes', () => {
    expect(normalizeMcpScopes(['repo:read', 'repo:read', 'files:read'])).toEqual([
      'repo:read',
      'files:read',
    ])
    expect(() => normalizeMcpScopes(['repo:write'])).toThrow('Unsupported MCP token scope')
  })

  it('normalizeMcpScopes defaults omitted scopes to all scopes', () => {
    expect(normalizeMcpScopes(undefined)).toEqual(['repo:read', 'docs:search', 'files:read'])
  })

  it('normalizeMcpScopes preserves an explicit empty array', () => {
    expect(normalizeMcpScopes([])).toEqual([])
  })

  it('generates a non-raw fingerprint from the token hash', () => {
    const { rawToken, tokenHash } = createMcpTokenSecret()
    const fingerprint = fingerprintMcpTokenHash(tokenHash)

    expect(rawToken).toHaveLength(64)
    expect(tokenHash).toHaveLength(64)
    expect(fingerprint).toMatch(/^cw_[a-f0-9]{8}\.[a-f0-9]{4}$/)
    expect(rawToken).not.toContain(fingerprint)
  })

  it('derives token status from expiry and revocation state', () => {
    const now = new Date('2026-04-28T00:00:00.000Z')

    expect(getMcpTokenStatus({ expiresAt: new Date('2026-04-29'), revokedAt: null }, now)).toBe(
      'active',
    )
    expect(getMcpTokenStatus({ expiresAt: new Date('2026-04-27'), revokedAt: null }, now)).toBe(
      'expired',
    )
    expect(
      getMcpTokenStatus({ expiresAt: new Date('2026-04-29'), revokedAt: new Date() }, now),
    ).toBe('revoked')
  })

  it('blocks connection tests for revoked and expired tokens', () => {
    const now = new Date('2026-04-28T00:00:00.000Z')

    expect(
      getMcpConnectionTestBlockReason(
        { expiresAt: new Date('2026-04-29'), revokedAt: new Date('2026-04-27') },
        now,
      ),
    ).toBe('MCP token is revoked. Renew it before testing.')
    expect(
      getMcpConnectionTestBlockReason({ expiresAt: new Date('2026-04-27'), revokedAt: null }, now),
    ).toBe('MCP token is expired. Renew it before testing.')
    expect(
      getMcpConnectionTestBlockReason({ expiresAt: new Date('2026-04-29'), revokedAt: null }, now),
    ).toBeNull()
  })

  it('derives expected MCP tools from token scopes', () => {
    expect(expectedMcpToolsForScopes(['repo:read', 'files:read'])).toEqual([
      'get_structure',
      'read_file',
    ])
  })
})
