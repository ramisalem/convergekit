import { describe, expect, it, vi } from 'vitest'

import {
  createMcpSessionLifecycleHandlers,
  McpSessionStore,
  parseMcpSessionStoreConfig,
} from './mcp-session-store.js'

function transport() {
  return {
    close: vi.fn(async () => undefined),
  }
}

describe('McpSessionStore', () => {
  it('returns principal-scoped sessions and refreshes lastSeenAt on access', () => {
    let now = 1_000
    const store = new McpSessionStore({ ttlMs: 60_000, maxSessions: 10, now: () => now })
    const first = transport()

    expect(store.set('session-1', { transport: first, principalKey: 'repo-1' })).toEqual([])

    now = 2_500
    const session = store.get('session-1', 'repo-1')

    expect(session?.transport).toBe(first)
    expect(session?.lastSeenAt).toBe(2_500)
    expect(store.get('session-1', 'repo-2')).toBeUndefined()
  })

  it('removes expired sessions so callers can close their transports', () => {
    let now = 1_000
    const store = new McpSessionStore({ ttlMs: 5_000, maxSessions: 10, now: () => now })
    const first = transport()
    const second = transport()
    store.set('session-1', { transport: first, principalKey: 'repo-1' })

    now = 4_000
    store.set('session-2', { transport: second, principalKey: 'repo-1' })

    now = 7_001
    const expired = store.sweepExpired()

    expect(expired.map((session) => session.id)).toEqual(['session-1'])
    expect(store.get('session-1', 'repo-1')).toBeUndefined()
    expect(store.get('session-2', 'repo-1')?.transport).toBe(second)
  })

  it('evicts least recently seen sessions when max session count is exceeded', () => {
    let now = 1_000
    const store = new McpSessionStore({ ttlMs: 60_000, maxSessions: 2, now: () => now })
    const first = transport()
    const second = transport()
    const third = transport()

    store.set('session-1', { transport: first, principalKey: 'repo-1' })
    now = 2_000
    store.set('session-2', { transport: second, principalKey: 'repo-1' })
    now = 3_000
    const evicted = store.set('session-3', { transport: third, principalKey: 'repo-1' })

    expect(evicted.map((session) => session.id)).toEqual(['session-1'])
    expect(store.size).toBe(2)
    expect(store.get('session-1', 'repo-1')).toBeUndefined()
    expect(store.get('session-2', 'repo-1')?.transport).toBe(second)
    expect(store.get('session-3', 'repo-1')?.transport).toBe(third)
  })
})

describe('createMcpSessionLifecycleHandlers', () => {
  it('removes sessions when the MCP transport reports session close callbacks', () => {
    const store = new McpSessionStore({
      ttlMs: 60_000,
      maxSessions: 10,
      now: () => 1_000,
    })
    const activeTransport = { sessionId: 'session-1', close: vi.fn(async () => undefined) }
    const handlers = createMcpSessionLifecycleHandlers({
      sessions: store,
      principalKey: 'repo-1',
      getTransport: () => activeTransport,
      closeEvictedSessions: vi.fn(),
    })

    handlers.onsessioninitialized('session-1')

    expect(store.size).toBe(1)

    handlers.onsessionclosed('session-1')

    expect(store.size).toBe(0)

    handlers.onsessioninitialized('session-1')

    expect(store.size).toBe(1)

    handlers.onclose()

    expect(store.size).toBe(0)
  })
})

describe('McpSessionStore principalKey isolation', () => {
  it('a session id is only retrievable under its own principalKey', () => {
    const store = new McpSessionStore<{ sessionId?: string }>({ ttlMs: 1000, maxSessions: 10 })
    store.set('s1', { transport: {}, principalKey: 'oauth:user_1' })
    expect(store.get('s1', 'oauth:user_1')).toBeTruthy()
    expect(store.get('s1', 'static:repo_9')).toBeUndefined()
  })
})

describe('parseMcpSessionStoreConfig', () => {
  it('uses safe production defaults', () => {
    expect(parseMcpSessionStoreConfig({})).toEqual({
      ttlMs: 30 * 60 * 1000,
      sweepIntervalMs: 60 * 1000,
      maxSessions: 200,
    })
  })

  it('accepts positive integer overrides', () => {
    expect(
      parseMcpSessionStoreConfig({
        MCP_SESSION_TTL_MS: '1000',
        MCP_SESSION_SWEEP_INTERVAL_MS: '2000',
        MCP_MAX_SESSIONS: '3',
      }),
    ).toEqual({
      ttlMs: 1000,
      sweepIntervalMs: 2000,
      maxSessions: 3,
    })
  })

  it('rejects invalid overrides', () => {
    expect(() => parseMcpSessionStoreConfig({ MCP_MAX_SESSIONS: '0' })).toThrow(
      /MCP_MAX_SESSIONS must be a positive integer/,
    )
  })
})
