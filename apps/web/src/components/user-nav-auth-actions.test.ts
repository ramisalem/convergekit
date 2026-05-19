import { readSource } from '../test/read-source'
import { describe, expect, it } from 'vitest'

describe('user nav auth actions', () => {
  it('signs out through the production API auth endpoint', () => {
    const source = readSource('src/components/sign-out-button.tsx')

    expect(source).toContain('/api/auth/sign-out')
    expect(source).toContain("method: 'POST'")
    expect(source).toContain("credentials: 'include'")
    expect(source).not.toContain('/api/sign-out')
  })

  it('renders sign out from shared user nav for every signed-in role', () => {
    const source = readSource('src/components/user-nav.tsx')

    expect(source).toContain('SignOutButton')
    expect(source).not.toContain("user.role === 'admin' ? '/settings' : '#'")
    expect(source).not.toContain('href={settingsHref}')
  })
})
