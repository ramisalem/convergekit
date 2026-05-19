import { describe, expect, it, vi } from 'vitest'

import { assertSamlReplayAllowed } from './workforce-saml-replay.js'

describe('assertSamlReplayAllowed', () => {
  it('rejects missing assertion ids', async () => {
    await expect(
      assertSamlReplayAllowed({ assertionId: '', expiresAt: new Date(), cache: null }),
    ).rejects.toThrow(/assertion id/i)
  })

  it('accepts first use and rejects replay', async () => {
    const set = vi.fn().mockResolvedValueOnce('OK').mockResolvedValueOnce(null)
    const cache = { set }
    const expiresAt = new Date(Date.now() + 60_000)

    await expect(
      assertSamlReplayAllowed({ assertionId: 'assertion-1', expiresAt, cache }),
    ).resolves.toBeUndefined()
    await expect(
      assertSamlReplayAllowed({ assertionId: 'assertion-1', expiresAt, cache }),
    ).rejects.toThrow(/replay/i)
  })

  it('fails closed when Redis is unreachable', async () => {
    const cache = { set: vi.fn().mockRejectedValue(new Error('redis down')) }

    await expect(
      assertSamlReplayAllowed({
        assertionId: 'assertion-1',
        expiresAt: new Date(Date.now() + 60_000),
        cache,
      }),
    ).rejects.toThrow(/replay cache/i)
  })
})
