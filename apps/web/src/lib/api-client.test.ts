import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/runtime-urls', () => ({ getApiBaseUrl: () => 'http://test' }))

import { ApiError, connectedAgentsApi, mcpOAuthApi } from './api-client'

const fetchMock = vi.fn()

function mockResponse(payload: unknown, init: Partial<Response> = {}) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => payload,
    ...init,
  } as unknown as Response
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('connectedAgentsApi', () => {
  it('lists connected agents from the expected endpoint', async () => {
    const payload = {
      agents: [
        { clientId: 'c1', clientName: 'Client 1', createdAt: '2026-01-01', lastUsedAt: null },
      ],
    }
    fetchMock.mockResolvedValue(mockResponse(payload))

    const result = await connectedAgentsApi.list()

    expect(result).toEqual(payload)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://test/api/me/connected-agents',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('revokes a connected agent with a URL-encoded client id', async () => {
    fetchMock.mockResolvedValue(mockResponse({ revoked: 1 }))

    const result = await connectedAgentsApi.revoke('client 1')

    expect(result).toEqual({ revoked: 1 })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://test/api/me/connected-agents/client%201',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    )
  })

  it('throws an ApiError carrying the server error message on failure', async () => {
    fetchMock.mockResolvedValue(
      mockResponse(
        { error: 'nope' },
        { ok: false, status: 404, statusText: 'Not Found' },
      ),
    )

    await expect(connectedAgentsApi.list()).rejects.toBeInstanceOf(ApiError)
    await expect(connectedAgentsApi.list()).rejects.toMatchObject({
      status: 404,
      message: 'nope',
    })
  })
})

describe('mcpOAuthApi', () => {
  it('fetches the consent display for an encoded request token', async () => {
    const payload = {
      clientName: 'Acme CLI',
      scopes: ['repo:read'],
      repositoryCount: 2,
      user: { name: 'Ada', email: 'ada@example.com' },
    }
    fetchMock.mockResolvedValue(mockResponse(payload))

    const result = await mcpOAuthApi.getConsent('tok en')

    expect(result).toEqual(payload)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://test/api/mcp-oauth/consent?request=tok%20en',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('posts a consent decision and returns the redirect URI', async () => {
    fetchMock.mockResolvedValue(mockResponse({ redirectUri: 'http://app/cb' }))

    const result = await mcpOAuthApi.decideConsent('req', 'approve')

    expect(result).toEqual({ redirectUri: 'http://app/cb' })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://test/api/mcp-oauth/consent',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ request: 'req', decision: 'approve' }),
      }),
    )
  })
})
