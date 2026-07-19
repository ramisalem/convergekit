import { afterEach, describe, expect, it, vi } from 'vitest'

import { getApiBaseUrl } from './runtime-urls'

describe('runtime URL resolution', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('uses the internal API URL for server-side fetches when configured', () => {
    vi.stubEnv('SERVER_API_URL', 'http://api:4001')
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://convergekit-dev.local')

    expect(getApiBaseUrl()).toBe('http://api:4001')
  })

  it('normalizes a public API URL that includes the API path for server-side fetches', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://convergekit.convergekit.dev/api')

    expect(getApiBaseUrl()).toBe('https://convergekit.convergekit.dev')
  })

  it('keeps browser-side API calls relative to the current origin', () => {
    vi.stubEnv('SERVER_API_URL', 'http://api:4001')
    vi.stubGlobal('window', {})

    expect(getApiBaseUrl()).toBe('')
  })
})
