import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./require-mcp-credential.ts', import.meta.url), 'utf8')
const tokenSource = readFileSync(new URL('./require-mcp-token.ts', import.meta.url), 'utf8')

describe('require-mcp-credential', () => {
  it('tries OAuth via validateAccessToken, loads the user, and rejects deactivated users', () => {
    expect(source).toContain('validateAccessToken')
    expect(source).toContain('deactivatedAt')
  })
  it('emits a 401 with WWW-Authenticate resource_metadata to drive client re-auth', () => {
    expect(source).toContain('WWW-Authenticate')
    expect(source).toContain('resource_metadata')
  })
  it('falls back to the unchanged static requireMcpToken middleware', () => {
    expect(source).toContain('requireMcpToken')
  })
  it('sets a normalized principal for downstream code', () => {
    expect(source).toContain("kind: 'oauth'")
    expect(source).toContain('mcpPrincipal')
  })
})

describe('require-mcp-token (dual-path CI tokens)', () => {
  it('gates user-level rows on the ci_tokens_enabled capability flag', () => {
    expect(tokenSource).toContain('userCiEnabled !== true')
    expect(tokenSource).toContain('repositoryId === null')
    expect(tokenSource).toContain('revokedAt')
    expect(tokenSource).toContain('expiresAt')
    expect(tokenSource).toContain('deactivatedAt')
  })
  it('keeps the grandfathered per-repo path alive via scopedRepositoryIds', () => {
    expect(tokenSource).toContain('leftJoin(repositories')
    expect(tokenSource).toContain('scopedRepositoryIds')
    expect(tokenSource).toContain("'mcp-repo'")
    expect(tokenSource).not.toContain("userRole !== 'admin'")
  })
  it('static principal carries the token id and repository scope for session keying', () => {
    expect(source).toContain('mcpTokenId: staticToken.id')
    expect(source).toContain('scopes: staticToken.scopes')
    expect(source).toContain('repositoryId: staticToken.repositoryId')
  })
})
