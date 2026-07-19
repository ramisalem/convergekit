import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const app = readFileSync(new URL('./app.ts', import.meta.url), 'utf8')
const authRoute = readFileSync(new URL('./routes/auth.ts', import.meta.url), 'utf8')

describe('mcp oauth app wiring', () => {
  it('mounts mcp-oauth routes and apex well-known', () => {
    expect(app).toContain('mcpOAuthRoutes')
    expect(app).toContain("'/mcp-oauth'")
    expect(app).toContain('wellKnownRoutes')
    expect(app).toContain('.well-known')
  })

  it('shadows the plugin well-known routes before the auth catch-all', () => {
    const shadowIndex = authRoute.indexOf('.well-known')
    const catchAllIndex = authRoute.indexOf("authRoutes.all('/*'")
    expect(shadowIndex).toBeGreaterThanOrEqual(0)
    expect(catchAllIndex).toBeGreaterThan(shadowIndex)
  })
})
