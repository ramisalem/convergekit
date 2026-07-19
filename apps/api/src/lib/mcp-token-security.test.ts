import { beforeEach, describe, expect, it, vi } from 'vitest'

// Queue-driven chainable db mock: each db.select/update call shifts the NEXT
// queued result, so a function running select-then-select-then-update pulls its
// rows in call order. Tests seed `state.queue` with each call's result, IN ORDER.
const h = vi.hoisted(() => {
  const state = { queue: [] as unknown[] }
  function term(val: unknown) {
    const c: Record<string, unknown> = {}
    for (const m of ['from', 'where', 'set', 'values']) c[m] = () => c
    c.limit = () => Promise.resolve(val)
    c.returning = () => Promise.resolve(val)
    c.orderBy = () => Promise.resolve(val)
    c.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(val).then(res, rej)
    c.catch = (rej: (e: unknown) => unknown) => Promise.resolve(val).catch(rej)
    return c
  }
  return {
    state,
    selectFn: vi.fn(() => term(state.queue.shift())),
    updateFn: vi.fn(() => term(state.queue.shift())),
    inArrayFn: vi.fn((_col: unknown, values: unknown) => ({ inArray: values })),
  }
})

vi.mock('@convergekit/db', () => ({
  db: { select: h.selectFn, update: h.updateFn },
  mcpTokenAlerts: {},
  mcpTokenAuditEvents: {},
  mcpTokens: { id: 'id', userId: 'userId', repositoryId: 'repositoryId', revokedAt: 'revokedAt' },
  session: {},
  user: { id: 'id', ciTokensEnabled: 'ciTokensEnabled' },
}))

vi.mock('drizzle-orm', () => ({
  and: (...values: unknown[]) => values,
  eq: (_column: unknown, value: unknown) => value,
  isNull: () => true,
  desc: () => 'desc',
  inArray: h.inArrayFn,
}))

// admin-1 keeps access to repo-ok; every other user has lost all repo access.
vi.mock('./scoping.js', () => ({
  scopedRepositoryIds: vi.fn(async (userId: string) =>
    userId === 'admin-1' ? new Set(['repo-ok']) : new Set<string>(),
  ),
}))

import { revokeMcpTokensNoLongerAllowed, shouldRevokeMcpTokenRow } from './mcp-token-security.js'

describe('shouldRevokeMcpTokenRow', () => {
  const allowed = new Set(['repo-1'])

  it('keeps a user-level token while the owner’s CI capability is enabled', () => {
    expect(
      shouldRevokeMcpTokenRow(
        { repositoryId: null },
        { allowedRepositoryIds: allowed, ownerCiEnabled: true },
      ),
    ).toBe(false)
  })

  it('revokes a user-level token when the owner’s CI capability is disabled', () => {
    expect(
      shouldRevokeMcpTokenRow(
        { repositoryId: null },
        { allowedRepositoryIds: allowed, ownerCiEnabled: false },
      ),
    ).toBe(true)
  })

  it('keeps legacy repo-scoped rows the owner can still access', () => {
    expect(
      shouldRevokeMcpTokenRow(
        { repositoryId: 'repo-1' },
        { allowedRepositoryIds: allowed, ownerCiEnabled: false },
      ),
    ).toBe(false)
  })

  it('revokes legacy repo-scoped rows the owner lost access to', () => {
    expect(
      shouldRevokeMcpTokenRow(
        { repositoryId: 'repo-2' },
        { allowedRepositoryIds: allowed, ownerCiEnabled: true },
      ),
    ).toBe(true)
  })
})

describe('revokeMcpTokensNoLongerAllowed', () => {
  beforeEach(() => {
    h.state.queue = []
    h.selectFn.mockClear()
    h.updateFn.mockClear()
    h.inArrayFn.mockClear()
  })

  it('revokes a flag-off owner’s user-level + newly-disallowed legacy tokens but leaves a flag-on owner’s untouched', async () => {
    h.state.queue = [
      // select #1 — active tokens for both users
      [
        { id: 't-ci-admin', userId: 'admin-1', repositoryId: null },
        { id: 't-ci-demoted', userId: 'demoted-1', repositoryId: null },
        { id: 't-legacy-demoted', userId: 'demoted-1', repositoryId: 'repo-gone' },
        { id: 't-legacy-keep', userId: 'admin-1', repositoryId: 'repo-ok' },
      ],
      // select #2 — current CI capability flags
      [
        { id: 'admin-1', ciTokensEnabled: true },
        { id: 'demoted-1', ciTokensEnabled: false },
      ],
      // update ... returning — only the flag-off user's two rows
      [{ id: 't-ci-demoted' }, { id: 't-legacy-demoted' }],
    ]

    const revoked = await revokeMcpTokensNoLongerAllowed(['admin-1', 'demoted-1'], 'access_changed')

    expect(revoked).toBe(2)
    // The flag-on user contributes no revoke ids, so update runs exactly once.
    expect(h.updateFn).toHaveBeenCalledTimes(1)
    // Last inArray call is the update's WHERE — the flag-off user's CI + legacy rows.
    expect(h.inArrayFn.mock.calls.at(-1)?.[1]).toEqual(['t-ci-demoted', 't-legacy-demoted'])
  })

  it('does not revoke a flag-on owner’s user-level token on a group/reactivation-style call', async () => {
    h.state.queue = [
      [{ id: 't-ci-admin', userId: 'admin-1', repositoryId: null }],
      [{ id: 'admin-1', ciTokensEnabled: true }],
    ]

    const revoked = await revokeMcpTokensNoLongerAllowed(['admin-1'], 'access_changed')

    expect(revoked).toBe(0)
    expect(h.updateFn).not.toHaveBeenCalled()
  })

  it('fails closed: a missing owner row (user deleted mid-call) revokes their user-level tokens', async () => {
    h.state.queue = [
      // select #1 — an active token whose owner row no longer exists
      [{ id: 't-ci-ghost', userId: 'ghost-1', repositoryId: null }],
      // select #2 — owners lookup returns nothing for ghost-1
      [],
      // update ... returning — the ghost's token is revoked
      [{ id: 't-ci-ghost' }],
    ]

    const revoked = await revokeMcpTokensNoLongerAllowed(['ghost-1'], 'access_changed')

    expect(revoked).toBe(1)
    expect(h.updateFn).toHaveBeenCalledTimes(1)
    expect(h.inArrayFn.mock.calls.at(-1)?.[1]).toEqual(['t-ci-ghost'])
  })
})
