import { describe, expect, it, vi } from 'vitest'

// The service imports @convergekit/db at module level (db client + table objects); the
// serializers under test are pure, so table sentinels are enough.
vi.mock('@convergekit/db', () => ({ db: {}, mcpTokenAlerts: {}, mcpTokens: {}, user: {} }))

import { serializeLegacyCiToken } from './ci-token-service.js'

function baseRow() {
  return {
    id: 't1',
    label: 'ci',
    fingerprint: 'cw_abc',
    scopes: ['repo:read'],
    expiresAt: new Date('2027-01-01T00:00:00Z'),
    revokedAt: null,
    revokedReason: null,
    lastUsedAt: null,
    lastUsedIp: null,
    lastUsedUserAgent: null,
    lastUsedClientName: null,
    lastUsedToolName: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }
}

describe('serializeLegacyCiToken repository.deletedAt (three input states)', () => {
  it('omits the key entirely when the caller does not select it — the self-service shape', () => {
    const out = serializeLegacyCiToken({
      ...baseRow(),
      repository: { id: 'r1', name: 'repo' },
    })
    expect('deletedAt' in out.repository).toBe(false)
    expect(out.repository).toEqual({ id: 'r1', name: 'repo' })
    expect('owner' in out).toBe(false)
  })

  it('emits deletedAt: null for an active repo on the oversight list', () => {
    const out = serializeLegacyCiToken({
      ...baseRow(),
      repository: { id: 'r1', name: 'repo', deletedAt: null },
    })
    expect(out.repository).toEqual({ id: 'r1', name: 'repo', deletedAt: null })
  })

  it('emits the timestamp for a soft-deleted repo — the anomaly oversight must see', () => {
    const deletedAt = new Date('2026-06-01T00:00:00Z')
    const out = serializeLegacyCiToken({
      ...baseRow(),
      repository: { id: 'r1', name: 'repo', deletedAt },
    })
    expect(out.repository).toEqual({ id: 'r1', name: 'repo', deletedAt })
  })
})

describe('serializeLegacyCiToken owner passthrough', () => {
  it('carries owner only when provided (admin oversight rows)', () => {
    const owner = { id: 'u1', name: 'Nadia', email: 'nadia@example.com' }
    const out = serializeLegacyCiToken({
      ...baseRow(),
      repository: { id: 'r1', name: 'repo' },
      owner,
    })
    expect(out.owner).toEqual(owner)
  })
})
