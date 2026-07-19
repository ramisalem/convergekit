import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./mcp.ts', import.meta.url), 'utf8')

describe('mcp route principal branching', () => {
  it('branches on the normalized principal', () => {
    expect(source).toContain('mcpPrincipal')
    expect(source).toContain("=== 'oauth'")
  })
  it('builds the user-scoped server for oauth principals', () => {
    expect(source).toContain('createUserScopedMcpServer')
    expect(source).toContain('buildUserServerDeps')
  })
  it('keys oauth sessions by user and audits with the oauth recorder', () => {
    expect(source).toContain('`oauth:${')
    expect(source).toContain('recordOAuthMcpAuditEvent')
  })
  it('branches the static path on principal.repositoryId: user-scoped server for user-level tokens, repo server for grandfathered tokens', () => {
    expect(source).toContain('mcpToolsForScopes(normalizeContextScopes(principal.scopes))')
    expect(source).toContain(
      'createUserScopedMcpServer(buildUserServerDeps(principal.userId), { enabledTools })',
    )
    expect(source).toContain('`static:${principal.mcpTokenId}`')
    expect(source).toContain('principal.repositoryId === null')
    expect(source).toContain('createMcpServer(')
  })
})
