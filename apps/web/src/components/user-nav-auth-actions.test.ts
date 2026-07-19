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

  it('clears repository cache on explicit sign-out', () => {
    const source = readSource('src/components/sign-out-button.tsx')

    expect(source).toContain("import { clearRepositoryCache } from '@/lib/repository-cache'")
    expect(source).toContain('clearRepositoryCache()')
    expect(source.indexOf('clearRepositoryCache()')).toBeLessThan(
      source.indexOf("window.location.href = '/auth/sign-in'"),
    )
  })

  it('renders sign out from shared user nav for every signed-in role', () => {
    const source = readSource('src/components/user-nav.tsx')

    expect(source).toContain('SignOutButton')
    expect(source).not.toContain("user.role === 'admin' ? '/settings' : '#'")
    expect(source).not.toContain('href={settingsHref}')
  })

  it('keeps personal OAuth photos out of the project chrome', () => {
    const source = readSource('src/components/user-nav.tsx')

    expect(source).not.toContain('user.image ?')
    expect(source).not.toContain('<img')
    expect(source).toContain('const initial =')
  })
})
