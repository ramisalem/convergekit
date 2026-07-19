import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readSource } from '../test/read-source'

vi.mock('@/lib/runtime-urls', () => ({ getApiBaseUrl: () => 'http://test' }))

import { adminCiTokensApi, meCiTokensApi } from './api-client'

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
  fetchMock.mockResolvedValue(mockResponse({ tokens: [], events: [], alerts: [] }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function lastCall() {
  const call = fetchMock.mock.calls.at(-1)
  return { url: call?.[0] as string, init: (call?.[1] ?? {}) as RequestInit }
}

describe('meCiTokensApi targets /api/me/ci-tokens*', () => {
  it('hits each endpoint with the right verb and path', async () => {
    await meCiTokensApi.list()
    expect(lastCall().url).toBe('http://test/api/me/ci-tokens')

    await meCiTokensApi.create({ label: 'ci', expiresInDays: 30, scopes: ['repo:read'] })
    expect(lastCall().url).toBe('http://test/api/me/ci-tokens')
    expect(lastCall().init.method).toBe('POST')

    await meCiTokensApi.renew('t1')
    expect(lastCall().url).toBe('http://test/api/me/ci-tokens/t1/renew')
    expect(lastCall().init.method).toBe('POST')

    await meCiTokensApi.revoke('t1')
    expect(lastCall().url).toBe('http://test/api/me/ci-tokens/t1')
    expect(lastCall().init.method).toBe('DELETE')

    await meCiTokensApi.getConfig('t1')
    expect(lastCall().url).toBe('http://test/api/me/ci-tokens/t1/config')

    await meCiTokensApi.listAudit('t1')
    expect(lastCall().url).toBe('http://test/api/me/ci-tokens/t1/audit')

    await meCiTokensApi.listAlerts('t1')
    expect(lastCall().url).toBe('http://test/api/me/ci-tokens/t1/alerts')

    await meCiTokensApi.acknowledgeAlert('t1', 'a1')
    expect(lastCall().url).toBe('http://test/api/me/ci-tokens/t1/alerts/a1/acknowledge')
    expect(lastCall().init.method).toBe('POST')

    await meCiTokensApi.testConnection('t1', 'raw')
    expect(lastCall().url).toBe('http://test/api/me/ci-tokens/t1/test')
    expect(lastCall().init.method).toBe('POST')

    await meCiTokensApi.listLegacy()
    expect(lastCall().url).toBe('http://test/api/me/ci-tokens/legacy')

    await meCiTokensApi.revokeLegacy('t2')
    expect(lastCall().url).toBe('http://test/api/me/ci-tokens/legacy/t2')
    expect(lastCall().init.method).toBe('DELETE')
  })
})

describe('adminCiTokensApi targets /api/admin/ci-tokens* (oversight only)', () => {
  it('hits each endpoint with the right verb and path', async () => {
    await adminCiTokensApi.list()
    expect(lastCall().url).toBe('http://test/api/admin/ci-tokens')

    await adminCiTokensApi.revoke('t1')
    expect(lastCall().url).toBe('http://test/api/admin/ci-tokens/t1')
    expect(lastCall().init.method).toBe('DELETE')

    await adminCiTokensApi.getConfig('t1')
    expect(lastCall().url).toBe('http://test/api/admin/ci-tokens/t1/config')

    await adminCiTokensApi.listAudit('t1')
    expect(lastCall().url).toBe('http://test/api/admin/ci-tokens/t1/audit')

    await adminCiTokensApi.listAlerts('t1')
    expect(lastCall().url).toBe('http://test/api/admin/ci-tokens/t1/alerts')

    await adminCiTokensApi.acknowledgeAlert('t1', 'a1')
    expect(lastCall().url).toBe('http://test/api/admin/ci-tokens/t1/alerts/a1/acknowledge')

    await adminCiTokensApi.listLegacy()
    expect(lastCall().url).toBe('http://test/api/admin/ci-tokens/legacy')

    await adminCiTokensApi.revokeLegacy('t2')
    expect(lastCall().url).toBe('http://test/api/admin/ci-tokens/legacy/t2')
    expect(lastCall().init.method).toBe('DELETE')
  })

  it('has no create/renew/testConnection (creation is self-service only)', () => {
    const oversight = adminCiTokensApi as Record<string, unknown>
    expect(oversight.create).toBeUndefined()
    expect(oversight.renew).toBeUndefined()
    expect(oversight.testConnection).toBeUndefined()
  })
})

describe('api-client.ts', () => {
  it('no longer exports the deprecated ciTokensApi shim (Task 13 deleted its last consumer)', () => {
    const source = readSource('src/lib/api-client.ts')
    expect(source).not.toContain('export const ciTokensApi')
  })
})
