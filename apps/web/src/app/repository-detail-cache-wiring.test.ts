import { describe, expect, it } from 'vitest'
import { readSource } from '../test/read-source'

describe('repository detail cache wiring', () => {
  const source = readSource('src/app/[locale]/repositories/[id]/page.tsx')

  it('seeds repo state synchronously from the in-memory cache', () => {
    expect(source).toContain('useState<RepositoryResponse | null>(() => getRepository(id))')
  })

  it('loads the session mirror after hydration when memory is empty', () => {
    expect(source).toContain('loadSessionMirror()')
    expect(source).toContain('const mirroredRepository = getRepository(id)')
    expect(source).toContain('setRepo(mirroredRepository)')
  })

  it('sets the repository cache owner before hydrating cached detail data', () => {
    expect(source).toContain('loading: userLoading')
    expect(source).toContain('setRepositoryCacheOwner(user.id)')
    expect(source.indexOf('setRepositoryCacheOwner(user.id)')).toBeLessThan(
      source.indexOf('loadSessionMirror()'),
    )
  })

  it('redirects unauthenticated users before hydrating cached detail data', () => {
    expect(source).toContain('if (!user) {')
    expect(source).toContain("router.replace('/auth/sign-in')")
    expect(source.indexOf("router.replace('/auth/sign-in')")).toBeLessThan(
      source.indexOf('setRepositoryCacheOwner(user.id)'),
    )
  })

  it('refreshes through the shared detail fetcher and forces on jobId change', () => {
    expect(source).toContain('fetchRepositoryDetail(id, fetchRepositoryDetailRecord')
    expect(source).toContain('force: Boolean(jobId)')
  })

  it('lets a 404 override any cached repository detail', () => {
    expect(source).toContain('err instanceof ApiError && err.status === 404')
    expect(source).toContain('removeRepository(id)')
    expect(source).toContain('setRepo(null)')
    expect(source).toContain("setLoadError('Repository not found')")
  })

  it('removes the updatedAt fallback from the last-indexed header', () => {
    expect(source).toContain('iso={repo?.indexedAt}')
    expect(source).not.toContain('repo?.indexedAt ?? repo?.updatedAt')
  })

  it('navigates internally with Link and router.push instead of full reloads', () => {
    expect(source).toContain("import Link from 'next/link'")
    expect(source).toContain('<Link')
    expect(source).toContain('router.push(`/${locale}/repositories/${id}?jobId=')
    expect(source).not.toContain('window.location.href =')
    expect(source).not.toContain('href="/repositories"')
  })

  it('remounts DocsTab when the job id changes', () => {
    expect(source).toContain("key={jobId ?? 'core'}")
  })
})
