import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('workforce SSO auth config route', () => {
  it('exposes public workforce SSO config without secrets', () => {
    const source = readFileSync(join(process.cwd(), 'src/routes/auth.ts'), 'utf8')
    expect(source).toContain("authRoutes.get('/config'")
    expect(source).toContain('workforceSsoEnabled')
    expect(source).toContain('workforceSsoProviderLabel')
    expect(source).not.toContain(['google', 'OAuth', 'Enabled'].join(''))
    expect(source).not.toContain('GOOGLE_CLIENT_SECRET')
  })
})
