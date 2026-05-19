import { describe, expect, it, vi } from 'vitest'

import { betterAuth } from 'better-auth'
import { buildAccountPolicyConfig, buildSessionPolicyConfig } from './account-policy.js'
import {
  authUserAdditionalFields,
  getOAuthProviderIdFromContext,
  resolveOAuthUserCreate,
} from './bootstrap-admin.js'
import { workforceSamlPlugin } from './workforce-saml-plugin.js'
import type { ValidatedSamlResponse } from './workforce-saml-service.js'

const secret = 'test-secret-that-is-long-enough-for-better-auth'
const restrictedAccessPolicy = {
  allowedEmailDomain: 'example.com',
  allowedGitHubOrg: null,
  allowedRepositoryHost: 'github.com',
}

const validSaml: ValidatedSamlResponse = {
  assertionId: 'assertion-valid',
  email: 'alice@example.com',
  name: 'Alice',
  notOnOrAfter: new Date(Date.now() + 60_000),
  relayState: '/en/repositories',
}

function convertSetCookieToCookie(setCookie: string): string {
  return setCookie
    .split(/,(?=\s*better-auth\.)/u)
    .map((cookie) => cookie.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ')
}

function buildPocAuth(input: {
  validateResponse: (samlResponse: string) => Promise<ValidatedSamlResponse>
  replaySet?: ReturnType<typeof vi.fn>
}) {
  const replaySet = input.replaySet ?? vi.fn().mockResolvedValue('OK')

  return betterAuth({
    secret,
    baseURL: 'http://localhost:4001/api/auth',
    user: { additionalFields: authUserAdditionalFields },
    socialProviders: {
      github: {
        clientId: 'github-client',
        clientSecret: 'github-secret',
      },
    },
    account: buildAccountPolicyConfig(),
    session: buildSessionPolicyConfig(14),
    plugins: [
      workforceSamlPlugin({
        service: {
          getMetadata: () => '<xml />',
          createLoginUrl: async () => 'https://idp.example/sso?SAMLRequest=test',
          validateResponse: async ({ samlResponse }) => input.validateResponse(samlResponse),
        },
        replayCache: { set: replaySet },
        accessPolicy: restrictedAccessPolicy,
        countAdmins: async () => 1,
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (userData, context) =>
            resolveOAuthUserCreate({
              providerId:
                (userData as { __source?: unknown }).__source === 'workforce-saml'
                  ? null
                  : getOAuthProviderIdFromContext(context),
              adminCount: 1,
              initialAdminEmail: 'admin@example.com',
              accessPolicy: restrictedAccessPolicy,
              userData,
            }),
        },
      },
    },
  })
}

function samlAcsRequest(samlResponse: string) {
  return new Request('http://localhost:4001/api/auth/workforce-saml/acs', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      SAMLResponse: samlResponse,
      RelayState: '/en/repositories',
    }),
  })
}

describe('workforce SAML Better Auth PoC', () => {
  it('creates a Better Auth-recognized user, account, and session for a valid assertion', async () => {
    const auth = buildPocAuth({
      validateResponse: async () => validSaml,
    })

    const response = await auth.handler(samlAcsRequest('valid signed assertion'))
    const cookie = convertSetCookieToCookie(response.headers.get('set-cookie') ?? '')
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/en/repositories')
    expect(session?.user.email).toBe('alice@example.com')
  })

  it.each([
    ['invalid signature', async () => Promise.reject(new Error('invalid signature'))],
    ['wrong issuer', async () => Promise.reject(new Error('wrong issuer'))],
    ['wrong audience', async () => Promise.reject(new Error('wrong audience'))],
    ['wrong ACS recipient', async () => Promise.reject(new Error('wrong recipient'))],
    [
      'expired assertion',
      async () => ({
        ...validSaml,
        assertionId: 'assertion-expired',
        notOnOrAfter: new Date(Date.now() - 1_000),
      }),
    ],
    ['non-policy email domain', async () => ({ ...validSaml, email: 'alice@other.test' })],
  ])('%s creates no session', async (samlResponse, validateResponse) => {
    const auth = buildPocAuth({ validateResponse })

    const response = await auth.handler(samlAcsRequest(samlResponse))

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('replayed assertion id creates no new session', async () => {
    const replaySet = vi.fn().mockResolvedValueOnce('OK').mockResolvedValueOnce(null)
    const auth = buildPocAuth({
      replaySet,
      validateResponse: async () => validSaml,
    })

    const firstResponse = await auth.handler(samlAcsRequest('valid signed assertion'))
    const replayResponse = await auth.handler(samlAcsRequest('replayed assertion id'))

    expect(firstResponse.status).toBe(302)
    expect(replayResponse.status).toBeGreaterThanOrEqual(400)
    expect(replayResponse.headers.get('set-cookie')).toBeNull()
  })
})
