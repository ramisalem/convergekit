import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Queue-driven chainable db mock: every db.select/update/insert call shifts the
// NEXT queued result off the queue, so a function that runs select-then-update-
// then-insert pulls its rows in call order. Each test seeds `state.queue` with
// the rows each db call should return, IN CALL ORDER.
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
    insertFn: vi.fn(() => term(state.queue.shift())),
    emit: vi.fn(),
  }
})

vi.mock('@convergekit/db', () => ({
  db: { select: h.selectFn, update: h.updateFn, insert: h.insertFn },
  mcpOauthToken: {
    id: 'id',
    familyId: 'familyId',
    accessTokenHash: 'accessTokenHash',
    refreshTokenHash: 'refreshTokenHash',
    revokedAt: 'revokedAt',
    userId: 'userId',
    clientId: 'clientId',
    createdAt: 'createdAt',
  },
  mcpOauthAuthorizationCode: { codeHash: 'codeHash', consumedAt: 'consumedAt' },
  oauthApplication: { clientId: 'clientId' },
}))

vi.mock('drizzle-orm', () => ({
  and: (...values: unknown[]) => values,
  eq: (_column: unknown, value: unknown) => value,
  isNull: () => true,
  desc: () => 'desc',
}))

vi.mock('./mcp-oauth-events.js', () => ({ emitMcpOAuthEvent: h.emit }))

// NOTE: ./mcp-oauth-policy.js is intentionally NOT mocked — it is pure, so
// hashOAuthToken / classifyRefresh / evaluateAccessToken / pkceVerify all run
// for real and these tests exercise their real branches.
import {
  consumeAuthorizationCode,
  findOAuthClient,
  issueGrant,
  listConnectedAgents,
  revokeGrantsForUser,
  revokeGrantsForUserClient,
  rotateRefreshToken,
  touchOAuthGrantUsage,
  validateAccessToken,
} from './mcp-oauth-store.js'

const MINUTE = 60 * 1000
function future(ms = 60 * MINUTE) {
  return new Date(Date.now() + ms)
}
function past(ms = 60 * MINUTE) {
  return new Date(Date.now() - ms)
}
function s256Challenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url')
}

beforeEach(() => {
  h.state.queue = []
  h.selectFn.mockClear()
  h.updateFn.mockClear()
  h.insertFn.mockClear()
  h.emit.mockClear()
})

describe('findOAuthClient', () => {
  it('maps a present row and parses the comma-separated redirectUrls', async () => {
    h.state.queue = [
      [
        {
          clientId: 'client-1',
          name: 'My App',
          redirectUrls: 'https://a.example.com, https://b.example.com ,',
          disabled: false,
        },
      ],
    ]

    const client = await findOAuthClient('client-1')

    expect(client).toEqual({
      clientId: 'client-1',
      clientName: 'My App',
      redirectUris: ['https://a.example.com', 'https://b.example.com'],
      disabled: false,
    })
  })

  it('returns null when the row is absent', async () => {
    h.state.queue = [[]]
    expect(await findOAuthClient('missing')).toBeNull()
  })
})

describe('consumeAuthorizationCode', () => {
  const verifier = 'the-code-verifier-value-1234567890'
  const baseCtx = {
    codeVerifier: verifier,
    clientId: 'client-1',
    redirectUri: 'https://app.example.com/cb',
  }

  function codeRow(overrides: Record<string, unknown> = {}) {
    return {
      userId: 'user-1',
      clientId: 'client-1',
      redirectUri: 'https://app.example.com/cb',
      scopes: ['mcp:repo:read'],
      codeChallenge: s256Challenge(verifier),
      codeChallengeMethod: 's256',
      expiresAt: future(),
      ...overrides,
    }
  }

  it('happy path: verifies PKCE and returns the grant', async () => {
    h.state.queue = [[codeRow()]]

    const result = await consumeAuthorizationCode('raw-code', baseCtx)

    expect(result).toEqual({
      ok: true,
      userId: 'user-1',
      clientId: 'client-1',
      scopes: ['mcp:repo:read'],
    })
  })

  it('invalid_grant when no unconsumed row matched (already consumed)', async () => {
    h.state.queue = [[]]
    expect(await consumeAuthorizationCode('raw-code', baseCtx)).toEqual({
      ok: false,
      error: 'invalid_grant',
    })
  })

  it('invalid_grant when the code is expired', async () => {
    h.state.queue = [[codeRow({ expiresAt: past() })]]
    expect(await consumeAuthorizationCode('raw-code', baseCtx)).toEqual({
      ok: false,
      error: 'invalid_grant',
    })
  })

  it('invalid_client when the clientId does not match', async () => {
    h.state.queue = [[codeRow({ clientId: 'other-client' })]]
    expect(await consumeAuthorizationCode('raw-code', baseCtx)).toEqual({
      ok: false,
      error: 'invalid_client',
    })
  })

  it('invalid_client when the redirectUri does not match', async () => {
    h.state.queue = [[codeRow({ redirectUri: 'https://evil.example.com/cb' })]]
    expect(await consumeAuthorizationCode('raw-code', baseCtx)).toEqual({
      ok: false,
      error: 'invalid_client',
    })
  })

  it('invalid_grant on PKCE mismatch (wrong verifier)', async () => {
    h.state.queue = [[codeRow()]]
    expect(
      await consumeAuthorizationCode('raw-code', { ...baseCtx, codeVerifier: 'wrong-verifier' }),
    ).toEqual({ ok: false, error: 'invalid_grant' })
  })

  it('invalid_grant when the challenge method is not s256', async () => {
    h.state.queue = [[codeRow({ codeChallengeMethod: 'plain', codeChallenge: verifier })]]
    expect(await consumeAuthorizationCode('raw-code', baseCtx)).toEqual({
      ok: false,
      error: 'invalid_grant',
    })
  })
})

describe('issueGrant', () => {
  it('issues access + refresh tokens and inserts the grant', async () => {
    h.state.queue = [undefined]

    const tokens = await issueGrant({
      userId: 'user-1',
      clientId: 'client-1',
      scopes: ['openid', 'mcp:repo:read'],
    })

    expect(tokens.accessToken).toMatch(/^[0-9a-f]+$/)
    expect(tokens.refreshToken).toMatch(/^[0-9a-f]+$/)
    expect(tokens.accessToken).not.toBe(tokens.refreshToken)
    expect(tokens.scope).toBe('openid mcp:repo:read')
    expect(tokens.expiresInSeconds).toBeGreaterThan(0)
    expect(h.insertFn).toHaveBeenCalledTimes(1)
    expect(h.emit).toHaveBeenCalledWith('token_issued', expect.objectContaining({ userId: 'user-1' }))
  })
})

describe('validateAccessToken', () => {
  function tokenRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'token-1',
      userId: 'user-1',
      clientId: 'client-1',
      scopes: ['mcp:repo:read'],
      revokedAt: null,
      accessTokenExpiresAt: future(),
      ...overrides,
    }
  }

  it('returns the principal for a valid token', async () => {
    h.state.queue = [[tokenRow()]]
    expect(await validateAccessToken('raw-access')).toEqual({
      oauthTokenId: 'token-1',
      userId: 'user-1',
      clientId: 'client-1',
      scopes: ['mcp:repo:read'],
    })
  })

  it('returns null when the token is expired', async () => {
    h.state.queue = [[tokenRow({ accessTokenExpiresAt: past() })]]
    expect(await validateAccessToken('raw-access')).toBeNull()
  })

  it('returns null when the token is revoked', async () => {
    h.state.queue = [[tokenRow({ revokedAt: new Date() })]]
    expect(await validateAccessToken('raw-access')).toBeNull()
  })

  it('returns null when the token is missing', async () => {
    h.state.queue = [[]]
    expect(await validateAccessToken('raw-access')).toBeNull()
  })
})

describe('rotateRefreshToken', () => {
  function grantRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'grant-1',
      familyId: 'family-1',
      userId: 'user-1',
      clientId: 'client-1',
      scopes: ['mcp:repo:read'],
      revokedAt: null,
      refreshTokenExpiresAt: future(24 * 60 * MINUTE),
      absoluteExpiresAt: future(60 * 24 * 60 * MINUTE),
      ...overrides,
    }
  }

  it('rotate happy path: claims the row (CAS) and issues a new token', async () => {
    h.state.queue = [
      [grantRow()], // select -> found row
      [{ id: 'grant-1' }], // update returning -> claimed
      undefined, // insert -> issueIntoFamily
    ]

    const result = await rotateRefreshToken('raw-refresh', { clientId: 'client-1' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.tokens.accessToken).toMatch(/^[0-9a-f]+$/)
      expect(result.tokens.refreshToken).toMatch(/^[0-9a-f]+$/)
    }
    expect(h.insertFn).toHaveBeenCalledTimes(1)
    expect(h.emit).toHaveBeenCalledWith('token_refreshed', expect.objectContaining({ familyId: 'family-1' }))
  })

  it('CAS lost the race: claimed is empty -> invalid_grant and no new token issued', async () => {
    h.state.queue = [
      [grantRow()], // select -> found row, classifies as rotate
      [], // update returning -> claimed nothing (another refresh won)
    ]

    const result = await rotateRefreshToken('raw-refresh', { clientId: 'client-1' })

    expect(result).toEqual({ ok: false, error: 'invalid_grant' })
    expect(h.insertFn).not.toHaveBeenCalled()
  })

  it('reuse_detected: a revoked row replays -> invalid_grant and revokes the whole family', async () => {
    h.state.queue = [
      [grantRow({ revokedAt: new Date() })], // select -> already-revoked row
      undefined, // update (revokeFamily)
    ]

    const result = await rotateRefreshToken('raw-refresh', { clientId: 'client-1' })

    expect(result).toEqual({ ok: false, error: 'invalid_grant' })
    expect(h.updateFn).toHaveBeenCalledTimes(1) // revokeFamily
    expect(h.insertFn).not.toHaveBeenCalled()
    expect(h.emit).toHaveBeenCalledWith(
      'token_revoked',
      expect.objectContaining({ familyId: 'family-1', initiator: 'reuse_detection' }),
    )
  })

  it('invalid_grant when the per-token refresh expiry is in the past (expired)', async () => {
    h.state.queue = [[grantRow({ refreshTokenExpiresAt: past() })]]
    expect(await rotateRefreshToken('raw-refresh', { clientId: 'client-1' })).toEqual({
      ok: false,
      error: 'invalid_grant',
    })
    expect(h.insertFn).not.toHaveBeenCalled()
  })

  it('invalid_grant when the absolute cap is in the past (absolute_expired)', async () => {
    h.state.queue = [[grantRow({ absoluteExpiresAt: past() })]]
    expect(await rotateRefreshToken('raw-refresh', { clientId: 'client-1' })).toEqual({
      ok: false,
      error: 'invalid_grant',
    })
    expect(h.insertFn).not.toHaveBeenCalled()
  })

  it('invalid_grant when the refresh token is not found', async () => {
    h.state.queue = [[]]
    expect(await rotateRefreshToken('raw-refresh', { clientId: 'client-1' })).toEqual({
      ok: false,
      error: 'invalid_grant',
    })
  })

  it('invalid_grant when the clientId does not match the grant', async () => {
    h.state.queue = [[grantRow({ clientId: 'other-client' })]]
    expect(await rotateRefreshToken('raw-refresh', { clientId: 'client-1' })).toEqual({
      ok: false,
      error: 'invalid_grant',
    })
  })
})

describe('revokeGrantsForUser / revokeGrantsForUserClient', () => {
  it('revokeGrantsForUser returns the number of revoked rows', async () => {
    h.state.queue = [[{ id: 'a' }, { id: 'b' }, { id: 'c' }]]
    expect(await revokeGrantsForUser('user-1', 'deactivation')).toBe(3)
  })

  it('revokeGrantsForUserClient returns the number of revoked rows', async () => {
    h.state.queue = [[{ id: 'a' }]]
    expect(await revokeGrantsForUserClient('user-1', 'client-1', 'user')).toBe(1)
  })
})

describe('listConnectedAgents', () => {
  it('dedupes by clientId keeping the first (most recent) row per client', async () => {
    const now = new Date()
    const older = new Date(now.getTime() - MINUTE)
    h.state.queue = [
      [
        { clientId: 'client-1', createdAt: now, lastUsedAt: now },
        { clientId: 'client-1', createdAt: older, lastUsedAt: older },
        { clientId: 'client-2', createdAt: older, lastUsedAt: null },
      ],
    ]

    const agents = await listConnectedAgents('user-1')

    expect(agents).toEqual([
      { clientId: 'client-1', createdAt: now, lastUsedAt: now },
      { clientId: 'client-2', createdAt: older, lastUsedAt: null },
    ])
  })
})

describe('touchOAuthGrantUsage', () => {
  it('issues a db.update and does not throw', async () => {
    h.state.queue = [undefined]
    await expect(
      touchOAuthGrantUsage('token-1', {
        ip: '127.0.0.1',
        userAgent: 'agent',
        clientName: 'My App',
        toolName: 'search',
      }),
    ).resolves.toBeUndefined()
    expect(h.updateFn).toHaveBeenCalledTimes(1)
  })
})
