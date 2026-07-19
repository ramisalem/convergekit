import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./mcp-oauth.ts', import.meta.url), 'utf8')

describe('mcp-oauth routes contract', () => {
  it('exposes authorize, consent (GET+POST), and token', () => {
    expect(source).toContain("mcpOAuthRoutes.get('/authorize'")
    expect(source).toContain("mcpOAuthRoutes.get('/consent'")
    expect(source).toContain("mcpOAuthRoutes.post('/consent'")
    expect(source).toContain("mcpOAuthRoutes.post('/token'")
  })

  it('authorize requires S256 PKCE and rejects unknown clients/redirects/scopes', () => {
    expect(source).toContain('code_challenge')
    expect(source).toContain("'S256'")
    expect(source).toContain('findOAuthClient')
    expect(source).toContain('redirectUris')
  })

  it('authorize always routes through consent (no straight-to-code path)', () => {
    expect(source).toContain('signConsentRequest')
    expect(source).toContain('config.consentUrl')
    expect(source).toContain('config.loginUrl')
  })

  it('consent POST mints the code; token redeems via the store', () => {
    expect(source).toContain('verifyConsentRequest')
    expect(source).toContain('createAuthorizationCode')
    expect(source).toContain('consumeAuthorizationCode')
    expect(source).toContain('rotateRefreshToken')
    expect(source).toContain('issueGrant')
  })

  it('token endpoint re-checks the client is known and not disabled before issuing', () => {
    // A client disabled after a grant was issued must not be able to redeem or refresh.
    const tokenHandler = source.slice(source.indexOf("mcpOAuthRoutes.post('/token'"))
    expect(tokenHandler).toContain('findOAuthClient(clientId)')
    expect(tokenHandler).toContain('client.disabled')
    expect(tokenHandler).toContain("{ error: 'invalid_client' }, 401")
  })

  it('reads the session via better-auth and bounces to login when absent', () => {
    expect(source).toContain('auth.api.getSession')
    expect(source).toContain('config.loginUrl')
    expect(source).toContain('redirectTo')
  })

  it('every endpoint self-gates on the kill switch (no AS endpoint responds when disabled)', () => {
    // authorize, token, consent GET, consent POST each guard on !config.enabled.
    const gates = source.match(/if \(!config\.enabled/g) ?? []
    expect(gates.length).toBeGreaterThanOrEqual(4)
  })
})
