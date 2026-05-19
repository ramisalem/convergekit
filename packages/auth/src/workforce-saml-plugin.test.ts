import { accessPolicyConfig } from '@convergekit/config/access-policy'
import { betterAuth } from 'better-auth'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildAccountPolicyConfig, buildSessionPolicyConfig } from './account-policy.js'
import {
  authUserAdditionalFields,
  getOAuthProviderIdFromContext,
  resolveOAuthUserCreate,
} from './bootstrap-admin.js'
import { WORKFORCE_SAML_PROVIDER_ID } from './workforce-saml-policy.js'
import { workforceSamlPlugin } from './workforce-saml-plugin.js'
import type { ValidatedSamlResponse } from './workforce-saml-service.js'

const secret = 'test-secret-that-is-long-enough-for-better-auth'

const validSaml: ValidatedSamlResponse = {
  assertionId: 'assertion-route-test',
  email: 'route-user@example.com',
  name: 'Route User',
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

function acsRequest(input: { samlResponse?: string; relayState?: string } = {}) {
  const body = new URLSearchParams({
    SAMLResponse: input.samlResponse ?? 'valid signed assertion',
  })
  if (input.relayState !== undefined) body.set('RelayState', input.relayState)

  return new Request('http://localhost:4001/api/auth/workforce-saml/acs', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
}

function buildAuth(input: {
  service?: {
    getMetadata?: () => string
    createLoginUrl?: (relayState?: string) => Promise<string>
    validateResponse?: (args: {
      samlResponse: string
      relayState?: string
    }) => Promise<ValidatedSamlResponse>
  } | null
  replaySet?: ReturnType<typeof vi.fn>
  countAdmins?: () => Promise<number>
  onAccountLinked?: ReturnType<typeof vi.fn>
}) {
  const replaySet = input.replaySet ?? vi.fn().mockResolvedValue('OK')
  const service =
    input.service === null
      ? null
      : {
          getMetadata: input.service?.getMetadata ?? (() => '<EntityDescriptor entityID="sp" />'),
          createLoginUrl:
            input.service?.createLoginUrl ??
            (async (relayState?: string) =>
              `https://idp.example/sso${relayState ? `?RelayState=${encodeURIComponent(relayState)}` : ''}`),
          validateResponse:
            input.service?.validateResponse ??
            (async ({ relayState }) => ({ ...validSaml, relayState })),
        }

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
        service,
        replayCache: { set: replaySet },
        accessPolicy: accessPolicyConfig,
        countAdmins: input.countAdmins ?? (async () => 1),
        onAccountLinked: input.onAccountLinked,
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (userData, context) =>
            resolveOAuthUserCreate({
              providerId:
                (userData as { __source?: unknown }).__source === WORKFORCE_SAML_PROVIDER_ID
                  ? null
                  : getOAuthProviderIdFromContext(context),
              adminCount: 1,
              initialAdminEmail: 'admin@example.com',
              accessPolicy: accessPolicyConfig,
              userData,
            }),
        },
      },
    },
  })
}

describe('workforceSamlPlugin routes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exposes SP metadata with the configured entity ID and ACS URL', async () => {
    const auth = buildAuth({
      service: {
        getMetadata: () =>
          '<EntityDescriptor entityID="urn:convergekit:dev"><AssertionConsumerService Location="http://localhost:4001/api/auth/workforce-saml/acs" /></EntityDescriptor>',
      },
    })

    const response = await auth.handler(
      new Request('http://localhost:4001/api/auth/workforce-saml/metadata'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/samlmetadata+xml')
    await expect(response.text()).resolves.toContain('urn:convergekit:dev')
  })

  it('redirects SP-initiated login to the IdP SSO URL', async () => {
    const createLoginUrl = vi.fn(async (relayState?: string) =>
      `https://idp.example/sso?RelayState=${encodeURIComponent(relayState ?? '')}`,
    )
    const auth = buildAuth({ service: { createLoginUrl } })

    const response = await auth.handler(
      new Request('http://localhost:4001/api/auth/workforce-saml/login?RelayState=/en/repositories'),
    )

    expect(response.status).toBe(302)
    expect(createLoginUrl).toHaveBeenCalledWith('/en/repositories')
    expect(response.headers.get('location')).toBe(
      'https://idp.example/sso?RelayState=%2Fen%2Frepositories',
    )
  })

  it('rejects ACS when workforce SSO is disabled', async () => {
    const auth = buildAuth({ service: null })

    const response = await auth.handler(acsRequest())

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('logs auth.saml.denied without logging raw assertions', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const auth = buildAuth({
      service: {
        validateResponse: async () => Promise.reject(new Error('invalid signature')),
      },
    })

    await auth.handler(acsRequest({ samlResponse: 'raw-secret-assertion' }))

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'auth.saml.denied',
      }),
    )
    expect(JSON.stringify(warn.mock.calls)).not.toContain('raw-secret-assertion')
  })

  it('logs auth.saml.provisioned for newly created users', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const auth = buildAuth({})

    const response = await auth.handler(acsRequest())

    expect(response.status).toBe(302)
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'auth.saml.provisioned',
        emailDomain: 'example.com',
      }),
    )
  })

  it('calls the linked-account hook after successful SAML account linking', async () => {
    const onAccountLinked = vi.fn()
    const auth = buildAuth({ onAccountLinked })

    const response = await auth.handler(acsRequest())

    expect(response.status).toBe(302)
    expect(onAccountLinked).toHaveBeenCalledWith({
      providerId: WORKFORCE_SAML_PROVIDER_ID,
      userId: expect.any(String),
    })
  })

  it('uses safe RelayState and falls back to /en/repositories for unsafe values', async () => {
    const auth = buildAuth({
      service: {
        validateResponse: async () => ({
          ...validSaml,
          assertionId: 'assertion-unsafe-relay-state',
          relayState: 'https://evil.example/phish',
        }),
      },
    })

    const response = await auth.handler(acsRequest({ relayState: 'https://evil.example/phish' }))
    const cookie = convertSetCookieToCookie(response.headers.get('set-cookie') ?? '')
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/en/repositories')
    expect(session?.user.email).toBe('route-user@example.com')
  })
})
