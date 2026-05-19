import { describe, expect, it, vi } from 'vitest'

vi.mock('@convergekit/ai', () => ({
  decryptApiKey: vi.fn(),
  encryptApiKey: vi.fn(),
  getModel: vi.fn(),
  maskApiKey: vi.fn(),
  probeEmbeddingProfile: vi.fn(),
}))

vi.mock('@convergekit/db', () => ({
  getUserAiSettings: vi.fn(),
  upsertUserAiSettings: vi.fn(),
}))

vi.mock('@convergekit/config/access-policy', () => ({
  accessPolicyConfig: {
    allowedEmailDomain: null,
    allowedGitHubOrg: null,
    allowedRepositoryHost: 'github.com',
  },
}))

import { settingsRoutes } from './settings.js'

describe('settings access policy route', () => {
  it('serializes unset optional policy values as null on the wire', async () => {
    // This imports the bare settings router. Auth/admin middleware is mounted in createApp().
    const res = await settingsRoutes.request('/access-policy')

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      allowedEmailDomain: null,
      allowedGitHubOrg: null,
      allowedRepositoryHost: 'github.com',
      editable: false,
    })
  })
})
