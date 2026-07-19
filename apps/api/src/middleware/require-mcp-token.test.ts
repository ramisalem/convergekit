import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnauthorizedError } from '../errors.js'

// Queue-driven chainable db mock (same convention as ../lib/mcp-oauth-store.test.ts):
// every db.select call shifts the NEXT queued result off the queue, so each test
// seeds `state.queue` with the rows its db calls should return, IN CALL ORDER.
const h = vi.hoisted(() => {
  const state = { queue: [] as unknown[] }
  function term(val: unknown) {
    const c: Record<string, unknown> = {}
    for (const m of ['from', 'innerJoin', 'leftJoin', 'where']) c[m] = () => c
    c.limit = () => Promise.resolve(val)
    return c
  }
  return {
    state,
    selectFn: vi.fn(() => term(state.queue.shift())),
    checkRateLimit: vi.fn(),
    raiseMcpTokenAlert: vi.fn(),
    recordMcpAuditEvent: vi.fn(),
    scopedRepositoryIds: vi.fn(),
    next: vi.fn(),
  }
})

vi.mock('@convergekit/db', () => ({
  db: { select: h.selectFn },
  mcpTokens: { tokenHash: 'tokenHash', userId: 'userId', repositoryId: 'repositoryId' },
  user: { id: 'id', deactivatedAt: 'deactivatedAt', ciTokensEnabled: 'ciTokensEnabled' },
  repositories: { id: 'id', deletedAt: 'deletedAt' },
}))

vi.mock('drizzle-orm', () => ({
  eq: (_column: unknown, value: unknown) => value,
}))

vi.mock('../lib/rate-limit.js', () => ({
  checkRateLimit: h.checkRateLimit,
}))

vi.mock('../lib/mcp-token-security.js', () => ({
  clientIp: () => '127.0.0.1',
  raiseMcpTokenAlert: h.raiseMcpTokenAlert,
  recordMcpAuditEvent: h.recordMcpAuditEvent,
}))

vi.mock('../lib/scoping.js', () => ({
  scopedRepositoryIds: h.scopedRepositoryIds,
}))

// NOTE: ../lib/mcp-token-policy.js is intentionally NOT mocked — hashMcpToken is
// pure, so the real hash-then-lookup path runs.
import { requireMcpToken } from './require-mcp-token.js'

const MINUTE = 60 * 1000
function future(ms = 60 * MINUTE) {
  return new Date(Date.now() + ms)
}
function past(ms = 60 * MINUTE) {
  return new Date(Date.now() - ms)
}

function tokenRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tok-1',
    repositoryId: null,
    userId: 'user-1',
    label: 'CI token',
    fingerprint: 'cw_abcd1234.ef56',
    scopes: ['repo:read', 'docs:search'],
    expiresAt: future(),
    revokedAt: null,
    lastUsedIp: null,
    lastUsedUserAgent: null,
    lastUsedClientName: null,
    lastUsedToolName: null,
    ...overrides,
  }
}

function dbRow(
  tokenOverrides: Record<string, unknown> = {},
  rowOverrides: Record<string, unknown> = {},
) {
  return {
    token: tokenRow(tokenOverrides),
    userDeactivatedAt: null,
    userCiEnabled: true,
    repositoryDeletedAt: null,
    ...rowOverrides,
  }
}

function createContext(authorization: string | null = 'Bearer raw-token') {
  const values = new Map<string, unknown>()
  return {
    req: {
      method: 'POST',
      header: (name: string) =>
        name === 'Authorization' ? (authorization ?? undefined) : undefined,
    },
    set: (key: string, value: unknown) => values.set(key, value),
    get: (key: string) => values.get(key),
    getValue: (key: string) => values.get(key),
    json: () => undefined,
  }
}

async function captureError(context: ReturnType<typeof createContext>) {
  try {
    await requireMcpToken(context as never, h.next)
    return null
  } catch (err) {
    return err
  }
}

beforeEach(() => {
  h.state.queue = []
  h.selectFn.mockClear()
  h.checkRateLimit.mockReset()
  h.checkRateLimit.mockResolvedValue({ allowed: true })
  h.raiseMcpTokenAlert.mockReset()
  h.recordMcpAuditEvent.mockReset()
  h.scopedRepositoryIds.mockReset()
  h.scopedRepositoryIds.mockResolvedValue(new Set())
  h.next.mockReset()
})

describe('requireMcpToken', () => {
  it('accepts a grandfathered repo-scoped token with live repository access', async () => {
    h.state.queue = [[dbRow({ repositoryId: 'r1' })]]
    h.scopedRepositoryIds.mockResolvedValue(new Set(['r1', 'r2']))
    h.next.mockResolvedValue(undefined)
    const context = createContext()

    await requireMcpToken(context as never, h.next)

    expect(h.next).toHaveBeenCalledTimes(1)
    expect(h.scopedRepositoryIds).toHaveBeenCalledWith('user-1')
    expect(context.getValue('mcpToken')).toEqual({
      id: 'tok-1',
      repositoryId: 'r1',
      userId: 'user-1',
      label: 'CI token',
      fingerprint: 'cw_abcd1234.ef56',
      scopes: ['repo:read', 'docs:search'],
      lastUsedIp: null,
      lastUsedUserAgent: null,
      lastUsedClientName: null,
      lastUsedToolName: null,
    })
    expect(h.checkRateLimit).toHaveBeenCalledTimes(3)
    expect(h.checkRateLimit).toHaveBeenCalledWith('r1', 'mcp-repo')
  })

  it('rejects a grandfathered repo-scoped token whose owner lost repository access', async () => {
    h.state.queue = [[dbRow({ repositoryId: 'r1' })]]
    h.scopedRepositoryIds.mockResolvedValue(new Set(['r2']))

    const err = await captureError(createContext())

    expect(err).toBeInstanceOf(UnauthorizedError)
    expect((err as UnauthorizedError).message).toBe('MCP token no longer has repository access')
    expect(h.next).not.toHaveBeenCalled()
  })

  it('rejects a grandfathered repo-scoped token whose repository was deleted', async () => {
    h.state.queue = [[dbRow({ repositoryId: 'r1' }, { repositoryDeletedAt: new Date() })]]

    const err = await captureError(createContext())

    expect(err).toBeInstanceOf(UnauthorizedError)
    expect((err as UnauthorizedError).message).toBe('MCP token repository was deleted')
    expect(h.next).not.toHaveBeenCalled()
    expect(h.scopedRepositoryIds).not.toHaveBeenCalled()
  })

  it('accepts a user-level token when the owner has ciTokensEnabled', async () => {
    h.state.queue = [[dbRow()]]
    h.next.mockResolvedValue(undefined)
    const context = createContext()

    await requireMcpToken(context as never, h.next)

    expect(h.next).toHaveBeenCalledTimes(1)
    expect(context.getValue('mcpToken')).toEqual({
      id: 'tok-1',
      repositoryId: null,
      userId: 'user-1',
      label: 'CI token',
      fingerprint: 'cw_abcd1234.ef56',
      scopes: ['repo:read', 'docs:search'],
      lastUsedIp: null,
      lastUsedUserAgent: null,
      lastUsedClientName: null,
      lastUsedToolName: null,
    })
    expect(h.checkRateLimit).toHaveBeenCalledTimes(2)
    expect(h.checkRateLimit).not.toHaveBeenCalledWith(expect.anything(), 'mcp-repo')
    expect(h.scopedRepositoryIds).not.toHaveBeenCalled()
  })

  it("rejects a user-level token when the owner's CI capability is disabled", async () => {
    h.state.queue = [[dbRow({}, { userCiEnabled: false })]]

    const err = await captureError(createContext())

    expect(err).toBeInstanceOf(UnauthorizedError)
    expect((err as UnauthorizedError).message).toBe('MCP token capability is disabled')
    expect(h.next).not.toHaveBeenCalled()
  })

  it('rejects a deactivated owner for a user-level token', async () => {
    h.state.queue = [[dbRow({}, { userDeactivatedAt: new Date() })]]

    const err = await captureError(createContext())

    expect(err).toBeInstanceOf(UnauthorizedError)
    expect((err as UnauthorizedError).message).toBe('MCP token user is deactivated')
    expect(h.next).not.toHaveBeenCalled()
  })

  it('rejects a deactivated owner for a grandfathered repo-scoped token', async () => {
    h.state.queue = [[dbRow({ repositoryId: 'r1' }, { userDeactivatedAt: new Date() })]]

    const err = await captureError(createContext())

    expect(err).toBeInstanceOf(UnauthorizedError)
    expect((err as UnauthorizedError).message).toBe('MCP token user is deactivated')
    expect(h.next).not.toHaveBeenCalled()
    expect(h.scopedRepositoryIds).not.toHaveBeenCalled()
  })

  it('rejects revoked and expired CI tokens', async () => {
    h.state.queue = [[dbRow({ revokedAt: new Date() })]]
    const revokedErr = await captureError(createContext())

    h.state.queue = [[dbRow({ expiresAt: past() })]]
    const expiredErr = await captureError(createContext())

    expect(revokedErr).toBeInstanceOf(UnauthorizedError)
    expect((revokedErr as UnauthorizedError).message).toBe('MCP token revoked')
    expect(expiredErr).toBeInstanceOf(UnauthorizedError)
    expect((expiredErr as UnauthorizedError).message).toBe('MCP token expired')
    expect(h.next).not.toHaveBeenCalled()
  })

  it('rejects an unknown token hash', async () => {
    h.state.queue = [[]]

    const err = await captureError(createContext())

    expect(err).toBeInstanceOf(UnauthorizedError)
    expect((err as UnauthorizedError).message).toBe('Invalid MCP token')
    expect(h.next).not.toHaveBeenCalled()
  })
})
