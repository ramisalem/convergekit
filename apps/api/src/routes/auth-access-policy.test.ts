import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authHandler: vi.fn(),
}))

vi.mock('@convergekit/auth', () => ({
  auth: {
    handler: mocks.authHandler,
  },
}))

vi.mock('@convergekit/config/access-policy', () => ({
  accessPolicyConfig: {
    allowedEmailDomain: 'example.com',
    allowedGitHubOrg: 'example-org',
    allowedRepositoryHost: 'github.com',
  },
  isAllowedAccessPolicyEmail: (
    email: string,
    config: { allowedEmailDomain: string | null },
  ) => {
    if (!config.allowedEmailDomain) return true
    const normalized = email.trim().toLowerCase()
    const at = normalized.lastIndexOf('@')
    return at > 0 && normalized.slice(at + 1) === config.allowedEmailDomain
  },
  normalizeAccessPolicyEmail: (email: string) => email.trim().toLowerCase(),
}))

import { authRoutes } from './auth.js'

describe('auth access policy', () => {
  beforeEach(() => {
    mocks.authHandler.mockReset()
    mocks.authHandler.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
  })

  it('rejects credential sign-in outside the configured email domain before Better Auth handles it', async () => {
    const res = await authRoutes.request('/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'person@other.test', password: 'password123' }),
    })

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({
      error: 'Email must use the example.com domain',
    })
    expect(mocks.authHandler).not.toHaveBeenCalled()
  })

  it('forwards configured-domain credential sign-in to Better Auth', async () => {
    const res = await authRoutes.request('/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'person@example.com', password: 'password123' }),
    })

    expect(res.status).toBe(200)
    expect(mocks.authHandler).toHaveBeenCalledTimes(1)
  })
})
