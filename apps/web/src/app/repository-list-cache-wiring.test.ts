import { describe, expect, it } from 'vitest'
import { readSource } from '../test/read-source'

describe('repository list cache wiring', () => {
  const source = readSource('src/app/[locale]/repositories/page.tsx')

  it('uses next/link for repository rows', () => {
    expect(source).toContain("import Link from 'next/link'")
    expect(source).toContain('<Link')
  })

  it('navigates rows with a locale-prefixed href and drops the bare anchor href', () => {
    expect(source).toContain('href={`/${locale}/repositories/${repo.id}`}')
    expect(source).not.toContain('href={`/repositories/${repo.id}`}')
    expect(source).toContain('prefetch')
  })

  it('warms the detail cache on hover and focus', () => {
    expect(source).toContain('prefetchRepository(repo.id, fetchRepositoryDetailRecord)')
    expect(source).toContain('onMouseEnter')
    expect(source).toContain('onFocus')
  })

  it('seeds the initial list render from the in-memory cache', () => {
    expect(source).toContain('getRepositoryList')
    expect(source).toContain('setRepositoryList')
  })

  it('loads the session mirror after hydration, not during render', () => {
    expect(source).toContain('loadSessionMirror()')
  })

  it('sets the repository cache owner before hydrating cached list data', () => {
    expect(source).toContain('loading: userLoading')
    expect(source).toContain('setRepositoryCacheOwner(user.id)')
    expect(source.indexOf('setRepositoryCacheOwner(user.id)')).toBeLessThan(
      source.indexOf('loadSessionMirror()'),
    )
  })

  it('redirects unauthenticated users before hydrating cached list data', () => {
    expect(source).toContain('if (!user) {')
    expect(source).toContain("router.replace('/auth/sign-in')")
    expect(source.indexOf("router.replace('/auth/sign-in')")).toBeLessThan(
      source.indexOf('setRepositoryCacheOwner(user.id)'),
    )
  })

  it('renders the merged cache result after a fresh list response', () => {
    expect(source).toContain('setRepositoryList(repositories)')
    expect(source).toContain('setRepositories(getRepositoryList() ?? repositories)')
    expect(source).not.toContain('setRepositories(repositories)\n        markPerf')
  })

  it('renders skeleton rows instead of a centered spinner', () => {
    expect(source).toContain('animate-pulse')
    expect(source).not.toContain('h-5 w-5 animate-spin rounded-full border-2 border-neutral-200')
  })
})
