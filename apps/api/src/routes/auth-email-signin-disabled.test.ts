import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authHandler: vi.fn(),
}))

vi.mock('@convergekit/auth', () => ({
  auth: {
    handler: mocks.authHandler,
  },
}))

vi.mock('@convergekit/config/workforce-sso', () => ({
  // Simulate the SSO-enabled production posture where email/password sign-in must be refused.
  resolveWorkforceSsoConfig: () => ({
    workforceSsoEnabled: true,
    providerLabel: 'Colab Ai Hub SSO',
    idpSsoUrl: 'https://accounts.google.com/o/saml2/idp?idpid=test',
    idpEntityId: 'https://accounts.google.com/o/saml2?idpid=test',
    idpCertificate: '-----BEGIN CERTIFICATE-----\nMIID\n-----END CERTIFICATE-----',
    spEntityId: 'urn:convergekit:test',
    acsUrl: 'http://localhost:4001/api/auth/workforce-saml/acs',
    startUrl: null,
    sessionTtlDays: 14,
    supportAdminEmails: [],
  }),
}))

import { authRoutes } from './auth.js'

describe('email/password sign-in deprecation when workforce SSO is enabled', () => {
  beforeEach(() => {
    mocks.authHandler.mockReset()
    mocks.authHandler.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
  })

  it('returns 403 with EMAIL_SIGN_IN_DISABLED for any email/password attempt', async () => {
    const res = await authRoutes.request('/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'someone@example.com', password: 'password123' }),
    })

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({
      error: 'Email/password sign-in is disabled. Please use Colab Ai Hub SSO.',
      code: 'EMAIL_SIGN_IN_DISABLED',
    })
    expect(mocks.authHandler).not.toHaveBeenCalled()
  })

  it('refuses even when the email belongs to the access-policy domain', async () => {
    const res = await authRoutes.request('/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'password123' }),
    })

    expect(res.status).toBe(403)
    expect(mocks.authHandler).not.toHaveBeenCalled()
  })

  it('still serves the public workforce SSO config endpoint', async () => {
    const res = await authRoutes.request('/config', { method: 'GET' })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      workforceSsoEnabled: true,
      workforceSsoProviderLabel: 'Colab Ai Hub SSO',
    })
    expect(mocks.authHandler).not.toHaveBeenCalled()
  })
})
