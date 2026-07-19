import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnauthorizedError } from '../errors.js'

const mocks = vi.hoisted(() => ({
  validateAccessToken: vi.fn(),
  userLimit: vi.fn(),
  checkRateLimit: vi.fn(),
  requireMcpToken: vi.fn(),
  recordOAuthAudit: vi.fn(),
  next: vi.fn(),
}))

vi.mock('@convergekit/config/mcp-oauth', () => ({
  resolveMcpOAuthConfig: () => ({
    enabled: true,
    issuerUrl: 'https://cw.dev',
    resourceUrl: 'https://cw.dev/api/mcp',
    loginUrl: 'https://cw.dev/login',
    consentUrl: 'https://cw.dev/consent',
  }),
}))

vi.mock('@convergekit/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: mocks.userLimit,
        })),
      })),
    })),
  },
  user: {
    id: 'id',
    deactivatedAt: 'deactivatedAt',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: (_column: unknown, value: unknown) => value,
}))

vi.mock('../lib/mcp-oauth-store.js', () => ({
  validateAccessToken: mocks.validateAccessToken,
}))

vi.mock('../lib/rate-limit.js', () => ({
  checkRateLimit: mocks.checkRateLimit,
}))

vi.mock('./require-mcp-token.js', () => ({
  requireMcpToken: mocks.requireMcpToken,
}))

vi.mock('../lib/mcp-token-security.js', () => ({
  recordOAuthMcpAuditEvent: mocks.recordOAuthAudit,
}))

import { requireMcpCredential } from './require-mcp-credential.js'

type JsonCapture = {
  body: unknown
  status?: number
  headers?: Record<string, string>
}

function createContext(authorization: string | null, method = 'POST') {
  const values = new Map<string, unknown>()
  let jsonCapture: JsonCapture | null = null
  const context = {
    req: {
      method,
      raw: { headers: new Headers() },
      header: (name: string) =>
        name === 'Authorization' ? (authorization ?? undefined) : undefined,
    },
    set: (key: string, value: unknown) => values.set(key, value),
    get: (key: string) => values.get(key),
    getValue: (key: string) => values.get(key),
    json: (body: unknown, status?: number, headers?: Record<string, string>) => {
      jsonCapture = { body, status, headers }
      return jsonCapture
    },
    getJson: () => jsonCapture,
  }
  return context
}

describe('requireMcpCredential', () => {
  beforeEach(() => {
    mocks.validateAccessToken.mockReset()
    mocks.userLimit.mockReset()
    mocks.checkRateLimit.mockReset()
    mocks.requireMcpToken.mockReset()
    mocks.recordOAuthAudit.mockReset()
    mocks.next.mockReset()
  })

  it('returns 401 discovery when no bearer token is present', async () => {
    const context = createContext(null)

    const result = (await requireMcpCredential(context as never, mocks.next)) as JsonCapture

    expect(result.status).toBe(401)
    expect(result.headers?.['WWW-Authenticate']).toContain(
      'resource_metadata="https://cw.dev/.well-known/oauth-protected-resource"',
    )
    expect(mocks.next).not.toHaveBeenCalled()
  })

  it('allows a valid OAuth token for an active user', async () => {
    const context = createContext('Bearer xyz')
    mocks.validateAccessToken.mockResolvedValue({
      oauthTokenId: 'tok-1',
      userId: 'user-1',
      clientId: 'client-1',
      scopes: ['repo:read'],
    })
    mocks.userLimit.mockResolvedValue([{ deactivatedAt: null }])
    mocks.checkRateLimit.mockResolvedValue({ allowed: true })
    mocks.next.mockResolvedValue('next-result')

    await requireMcpCredential(context as never, mocks.next)

    expect(mocks.next).toHaveBeenCalledTimes(1)
    expect(context.getValue('mcpPrincipal')).toEqual({
      kind: 'oauth',
      oauthTokenId: 'tok-1',
      userId: 'user-1',
      clientId: 'client-1',
      scopes: ['repo:read'],
    })
  })

  it('rejects a valid OAuth token for a deactivated user', async () => {
    const context = createContext('Bearer xyz')
    mocks.validateAccessToken.mockResolvedValue({
      oauthTokenId: 'tok-1',
      userId: 'user-1',
      clientId: 'client-1',
      scopes: ['repo:read'],
    })
    mocks.userLimit.mockResolvedValue([{ deactivatedAt: new Date() }])

    const result = (await requireMcpCredential(context as never, mocks.next)) as JsonCapture

    expect(result.status).toBe(401)
    expect(result.headers?.['WWW-Authenticate']).toContain('resource_metadata=')
    expect(mocks.next).not.toHaveBeenCalled()
  })

  it('rejects a valid OAuth token when the user is missing', async () => {
    const context = createContext('Bearer xyz')
    mocks.validateAccessToken.mockResolvedValue({
      oauthTokenId: 'tok-1',
      userId: 'user-1',
      clientId: 'client-1',
      scopes: ['repo:read'],
    })
    mocks.userLimit.mockResolvedValue([])

    const result = (await requireMcpCredential(context as never, mocks.next)) as JsonCapture

    expect(result.status).toBe(401)
    expect(result.headers?.['WWW-Authenticate']).toContain('resource_metadata=')
    expect(mocks.next).not.toHaveBeenCalled()
  })

  it('returns 429 and records an audit event when rate limited', async () => {
    const context = createContext('Bearer xyz')
    mocks.validateAccessToken.mockResolvedValue({
      oauthTokenId: 'tok-1',
      userId: 'user-1',
      clientId: 'client-1',
      scopes: ['repo:read'],
    })
    mocks.userLimit.mockResolvedValue([{ deactivatedAt: null }])
    mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 42 })
    mocks.checkRateLimit.mockResolvedValueOnce({ allowed: true })

    const result = (await requireMcpCredential(context as never, mocks.next)) as JsonCapture

    expect(result.status).toBe(429)
    expect(result.headers?.['Retry-After']).toBe('42')
    expect(mocks.recordOAuthAudit).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rate_limited', statusCode: 429 }),
    )
    expect(mocks.next).not.toHaveBeenCalled()
  })

  it('falls back to the static token middleware on success', async () => {
    const context = createContext('Bearer xyz')
    mocks.validateAccessToken.mockResolvedValue(null)
    mocks.next.mockResolvedValue('next-result')
    mocks.requireMcpToken.mockImplementation(
      async (c: never, innerNext: () => Promise<unknown>) => {
        ;(c as { set: (k: string, v: unknown) => void }).set('mcpToken', {
          id: 'tok-1',
          userId: 'u',
          repositoryId: 'r',
          scopes: ['repo:read'],
        })
        return innerNext()
      },
    )

    await requireMcpCredential(context as never, mocks.next)

    expect(mocks.next).toHaveBeenCalledTimes(1)
    expect(context.getValue('mcpPrincipal')).toEqual({
      kind: 'static',
      userId: 'u',
      mcpTokenId: 'tok-1',
      repositoryId: 'r',
      scopes: ['repo:read'],
    })
  })

  it('returns 401 discovery when the static fallback is unauthorized', async () => {
    const context = createContext('Bearer xyz')
    mocks.validateAccessToken.mockResolvedValue(null)
    mocks.requireMcpToken.mockImplementation(async () => {
      throw new UnauthorizedError('bad')
    })

    const result = (await requireMcpCredential(context as never, mocks.next)) as JsonCapture

    expect(result.status).toBe(401)
    expect(result.headers?.['WWW-Authenticate']).toContain('resource_metadata=')
    expect(mocks.next).not.toHaveBeenCalled()
  })
})
