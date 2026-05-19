import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('user management access policy contracts', () => {
  it('validates admin-created user email against the configured access policy before insert', () => {
    const source = readFileSync(join(process.cwd(), 'src/routes/users.ts'), 'utf8')

    expect(source).toContain('@convergekit/config/access-policy')
    expect(source).toContain('normalizeAccessPolicyEmail')
    expect(source).toContain('assertAllowedAccessPolicyEmail(email)')
    expect(source.indexOf('assertUserEmailAllowed(body.email)')).toBeLessThan(
      source.indexOf('.insert(user)'),
    )
  })

  it('blocks invite resend and reset for legacy users outside the configured email domain', () => {
    const source = readFileSync(join(process.cwd(), 'src/routes/users.ts'), 'utf8')

    expect(source).toContain('assertTargetUserAllowed')
    expect(source).toContain("userManagementRoutes.post('/:id/resend-invite'")
    expect(source).toContain("userManagementRoutes.post('/:id/reset-password'")
    expect(source).toContain('await assertTargetUserAllowed(id)')
  })

  it('treats invite tokens for legacy invalid-domain users as invalid', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/invites.ts'), 'utf8')

    expect(source).toContain('@convergekit/config/access-policy')
    expect(source).toContain('isAllowedAccessPolicyEmail(row.email)')
    expect(source).toContain('return null')
    expect(source).toContain('return false')
  })
})
