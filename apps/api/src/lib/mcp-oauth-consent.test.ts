import { describe, expect, it } from 'vitest'
import { signConsentRequest, verifyConsentRequest, type ConsentRequest } from './mcp-oauth-consent.js'

const secret = 'test-secret-please-ignore-32-chars-min'
const base: ConsentRequest = {
  clientId: 'client_abc',
  redirectUri: 'https://app/cb',
  scopes: ['repo:read', 'docs:search'],
  codeChallenge: 'chal',
  codeChallengeMethod: 'S256',
  state: 'xyz',
  userId: 'user_1',
  exp: Date.now() + 600_000,
}

describe('consent request token', () => {
  it('round-trips a signed request', () => {
    const token = signConsentRequest(base, secret)
    expect(verifyConsentRequest(token, secret)).toEqual(base)
  })

  it('rejects tampering', () => {
    const token = signConsentRequest(base, secret)
    const [payload] = token.split('.')
    expect(verifyConsentRequest(`${payload}.deadbeef`, secret)).toBeNull()
  })

  it('rejects a wrong secret', () => {
    const token = signConsentRequest(base, secret)
    expect(verifyConsentRequest(token, 'a-different-secret-value-32-characters')).toBeNull()
  })

  it('rejects an expired request', () => {
    const token = signConsentRequest({ ...base, exp: Date.now() - 1 }, secret)
    expect(verifyConsentRequest(token, secret)).toBeNull()
  })
})
