import { beforeEach, describe, expect, it, vi } from 'vitest'

// The route reads BETTER_AUTH_SECRET at module load and passes it to the REAL consent
// signer, so it must be set before the route module is imported. A plain top-level
// assignment would run AFTER the hoisted ESM imports; vi.hoisted() lifts this above them.
vi.hoisted(() => {
  process.env.BETTER_AUTH_SECRET = 'test-secret-value-at-least-32-chars-long'
})

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  scopedRepositoryIds: vi.fn(),
  findOAuthClient: vi.fn(),
  createAuthorizationCode: vi.fn(),
  consumeAuthorizationCode: vi.fn(),
  issueGrant: vi.fn(),
  rotateRefreshToken: vi.fn(),
}))

vi.mock('@convergekit/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }))

vi.mock('@convergekit/config/mcp-oauth', () => ({
  resolveMcpOAuthConfig: () => ({
    enabled: true,
    issuerUrl: 'https://cw.dev',
    resourceUrl: 'https://cw.dev/api/mcp',
    loginUrl: 'https://cw.dev/auth/sign-in',
    consentUrl: 'https://cw.dev/mcp/consent',
  }),
}))

vi.mock('../lib/scoping.js', () => ({ scopedRepositoryIds: mocks.scopedRepositoryIds }))

vi.mock('../lib/mcp-oauth-store.js', () => ({
  findOAuthClient: mocks.findOAuthClient,
  createAuthorizationCode: mocks.createAuthorizationCode,
  consumeAuthorizationCode: mocks.consumeAuthorizationCode,
  issueGrant: mocks.issueGrant,
  rotateRefreshToken: mocks.rotateRefreshToken,
}))

vi.mock('../lib/mcp-oauth-events.js', () => ({ emitMcpOAuthEvent: vi.fn() }))

// NOTE: ../lib/mcp-oauth-consent.js (HMAC sign/verify) and ../lib/mcp-oauth-policy.js
// (filterMcpScopes) are intentionally NOT mocked so authorize -> consent -> token
// round-trips with the real signed request token.

import { mcpOAuthRoutes } from './mcp-oauth.js'

const REGISTERED_CLIENT = {
  clientId: 'c1',
  clientName: 'Cli',
  redirectUris: ['https://app/cb'],
  disabled: false,
}

const SESSION = { user: { id: 'u1', name: 'U', email: 'u@example.com' } }

function authorizeUrl(overrides: Record<string, string | null> = {}): string {
  const params: Record<string, string> = {
    client_id: 'c1',
    redirect_uri: 'https://app/cb',
    response_type: 'code',
    code_challenge: 'challenge-value',
    code_challenge_method: 'S256',
    scope: 'repo:read docs:search',
    state: 'state-123',
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) delete params[key]
    else params[key] = value
  }
  return `/authorize?${new URLSearchParams(params).toString()}`
}

/** Drive authorize with a session and pull the signed `request` token out of the consent redirect. */
async function mintConsentRequest(): Promise<string> {
  mocks.findOAuthClient.mockResolvedValue(REGISTERED_CLIENT)
  mocks.getSession.mockResolvedValue(SESSION)
  const res = await mcpOAuthRoutes.request(authorizeUrl())
  const location = res.headers.get('location')
  if (!location) throw new Error('authorize did not redirect')
  const request = new URL(location).searchParams.get('request')
  if (!request) throw new Error('consent redirect missing request token')
  return request
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset()
  // Sensible defaults; individual tests override as needed.
  mocks.findOAuthClient.mockResolvedValue(REGISTERED_CLIENT)
  mocks.scopedRepositoryIds.mockResolvedValue(new Set(['r1', 'r2']))
  mocks.getSession.mockResolvedValue(null)
})

describe('GET /authorize', () => {
  it('rejects an unknown client with 400 invalid_client', async () => {
    mocks.findOAuthClient.mockResolvedValue(null)
    const res = await mcpOAuthRoutes.request(authorizeUrl())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_client' })
  })

  it('rejects a redirect_uri not registered for the client with 400', async () => {
    const res = await mcpOAuthRoutes.request(authorizeUrl({ redirect_uri: 'https://evil/cb' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error_description: 'redirect_uri mismatch' })
  })

  it('redirects with error=invalid_request when code_challenge is missing', async () => {
    const res = await mcpOAuthRoutes.request(authorizeUrl({ code_challenge: null }))
    expect(res.status).toBe(302)
    const location = res.headers.get('location')
    expect(location).toContain('https://app/cb')
    expect(location).toContain('error=invalid_request')
  })

  it('redirects with error=invalid_request when the PKCE method is not S256', async () => {
    const res = await mcpOAuthRoutes.request(authorizeUrl({ code_challenge_method: 'plain' }))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('error=invalid_request')
  })

  it('bounces to the login page (with redirectTo) when there is no session', async () => {
    mocks.getSession.mockResolvedValue(null)
    const res = await mcpOAuthRoutes.request(authorizeUrl())
    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location.startsWith('https://cw.dev/auth/sign-in')).toBe(true)
    const redirectTo = new URL(location).searchParams.get('redirectTo')
    expect(redirectTo).toBeTruthy()
    expect(redirectTo).toContain('/api/mcp-oauth/authorize')
  })

  it('always routes a logged-in user through consent (no straight-to-code path)', async () => {
    mocks.getSession.mockResolvedValue(SESSION)
    const res = await mcpOAuthRoutes.request(authorizeUrl())
    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location.startsWith('https://cw.dev/mcp/consent')).toBe(true)
    expect(new URL(location).searchParams.get('request')).toBeTruthy()
  })
})

describe('GET /consent', () => {
  it('returns consent display data for a valid request token', async () => {
    const request = await mintConsentRequest()
    mocks.getSession.mockResolvedValue(SESSION)

    const res = await mcpOAuthRoutes.request(`/consent?request=${encodeURIComponent(request)}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      clientName: 'Cli',
      scopes: ['repo:read', 'docs:search'],
      repositoryCount: 2,
      user: { name: 'U', email: 'u@example.com' },
    })
  })

  it('returns 401 when there is no session', async () => {
    const request = await mintConsentRequest()
    mocks.getSession.mockResolvedValue(null)

    const res = await mcpOAuthRoutes.request(`/consent?request=${encodeURIComponent(request)}`)
    expect(res.status).toBe(401)
  })

  it('returns 400 for an empty/invalid request token', async () => {
    mocks.getSession.mockResolvedValue(SESSION)
    const res = await mcpOAuthRoutes.request('/consent?request=')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_request' })
  })
})

describe('POST /consent', () => {
  async function postConsent(body: unknown) {
    return mcpOAuthRoutes.request('/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('mints an authorization code on approve and returns a redirectUri with code=', async () => {
    const request = await mintConsentRequest()
    mocks.getSession.mockResolvedValue(SESSION)
    mocks.createAuthorizationCode.mockResolvedValue('auth-code-xyz')

    const res = await postConsent({ request, decision: 'approve' })
    expect(res.status).toBe(200)
    const { redirectUri } = (await res.json()) as { redirectUri: string }
    expect(redirectUri).toContain('https://app/cb')
    expect(redirectUri).toContain('code=auth-code-xyz')
    expect(mocks.createAuthorizationCode).toHaveBeenCalledTimes(1)
  })

  it('returns a redirectUri with error=access_denied on deny', async () => {
    const request = await mintConsentRequest()
    mocks.getSession.mockResolvedValue(SESSION)

    const res = await postConsent({ request, decision: 'deny' })
    expect(res.status).toBe(200)
    const { redirectUri } = (await res.json()) as { redirectUri: string }
    expect(redirectUri).toContain('error=access_denied')
    expect(mocks.createAuthorizationCode).not.toHaveBeenCalled()
  })
})

describe('POST /token', () => {
  function postToken(fields: Record<string, string>) {
    return mcpOAuthRoutes.request('/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    })
  }

  it('returns 401 invalid_client for a disabled client', async () => {
    mocks.findOAuthClient.mockResolvedValue({ ...REGISTERED_CLIENT, disabled: true })
    const res = await postToken({ grant_type: 'authorization_code', client_id: 'c1', code: 'x' })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'invalid_client' })
  })

  it('exchanges an authorization_code for tokens', async () => {
    mocks.consumeAuthorizationCode.mockResolvedValue({
      ok: true,
      userId: 'u1',
      clientId: 'c1',
      scopes: ['repo:read'],
    })
    mocks.issueGrant.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresInSeconds: 1800,
      scope: 'repo:read',
    })

    const res = await postToken({
      grant_type: 'authorization_code',
      client_id: 'c1',
      code: 'the-code',
      code_verifier: 'verifier',
      redirect_uri: 'https://app/cb',
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      access_token: 'access-1',
      token_type: 'bearer',
      expires_in: 1800,
      refresh_token: 'refresh-1',
      scope: 'repo:read',
    })
  })

  it('rotates a refresh_token for new tokens', async () => {
    mocks.rotateRefreshToken.mockResolvedValue({
      ok: true,
      tokens: {
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
        expiresInSeconds: 1800,
        scope: 'repo:read docs:search',
      },
    })

    const res = await postToken({
      grant_type: 'refresh_token',
      client_id: 'c1',
      refresh_token: 'old-refresh',
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      access_token: 'access-2',
      refresh_token: 'refresh-2',
      token_type: 'bearer',
    })
  })

  it('returns 400 when the authorization code is invalid', async () => {
    mocks.consumeAuthorizationCode.mockResolvedValue({ ok: false, error: 'invalid_grant' })
    const res = await postToken({
      grant_type: 'authorization_code',
      client_id: 'c1',
      code: 'bad',
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_grant' })
  })

  it('returns 400 unsupported_grant_type for an unknown grant', async () => {
    const res = await postToken({ grant_type: 'client_credentials', client_id: 'c1' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'unsupported_grant_type' })
  })
})
