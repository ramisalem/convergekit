import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mustSlice } from '../test/source-pins.js'

const src = readFileSync(new URL('./me.ts', import.meta.url), 'utf8')

describe('me router', () => {
  it('mounts under /me, behind requireAuth', () => {
    const app = readFileSync(new URL('../app.ts', import.meta.url), 'utf8')

    expect(app).toContain("app.use('/me/*', requireAuth)")
    expect(app).toContain("app.route('/me', meRoutes)")
    expect(src).toContain("meRoutes.get('/'")
  })

  it('projects ciTokensEnabled into the /api/me user payload', () => {
    // Scope to the dbUser select only — NOT the sibling activeAdmins query below
    // it, which intentionally stays a narrow { name, email } projection for the
    // support-contacts list.
    const dbUserBlock = mustSlice(src, 'const dbUser = await db', 'const activeAdmins = await db')

    expect(dbUserBlock).toContain('ciTokensEnabled: user.ciTokensEnabled')
  })

  it('returns the select result verbatim as the user payload (no manual reshaping)', () => {
    expect(src).toContain('user: dbUser[0]')
  })
})
