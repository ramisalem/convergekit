import { readSource } from '../test/read-source'
import { describe, expect, it } from 'vitest'

describe('local dev API proxy config', () => {
  it('rewrites backend-owned /api routes to the local API service before locale routing', () => {
    const source = readSource('next.config.ts')

    expect(source).toContain('LOCAL_API_PROXY_URL')
    expect(source).toContain("process.env.NODE_ENV !== 'production'")
    expect(source).toContain('beforeFiles:')
    expect(source).toContain("'/api/repositories/:path*'")
    expect(source).toContain("'/api/auth/:path*'")
    expect(source).toContain("'/api/chat/sessions'")
    expect(source).toContain("'/api/chat/sessions/:path*'")
    expect(source).toContain("'/api/wiki/:path*'")
    expect(source).toContain('destination: `${localApiProxyUrl}${source}`')
    expect(source).not.toContain("'/api/chat/:path*'")
  })
})
