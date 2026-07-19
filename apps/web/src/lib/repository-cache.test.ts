import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryResponse } from '@convergekit/types'
import {
  clearRepositoryCache,
  fetchRepositoryDetail,
  getRepository,
  getRepositoryList,
  loadSessionMirror,
  mergeRepositoryRecord,
  prefetchRepository,
  primeRepositoryFromList,
  removeRepository,
  resetRepositoryCache,
  setRepository,
  setRepositoryCacheOwner,
  setRepositoryList,
} from './repository-cache'

function repo(overrides: Partial<RepositoryResponse> = {}): RepositoryResponse {
  return {
    id: 'r1',
    name: 'example-backend',
    cloneUrl: 'https://github.com/example-org/example-backend.git',
    provider: 'github',
    defaultBranch: 'main',
    isPrivate: false,
    status: 'done',
    userId: 'u1',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  setRepositoryCacheOwner('test-user')
})

afterEach(() => {
  resetRepositoryCache()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('mergeRepositoryRecord', () => {
  it('returns a copy of the incoming record when nothing is cached', () => {
    const incoming = repo()
    const merged = mergeRepositoryRecord(undefined, incoming, 'detail')
    expect(merged).toEqual(incoming)
    expect(merged).not.toBe(incoming)
  })

  it('lets a detail response overwrite list-seeded fields', () => {
    const existing = repo({ status: 'processing' })
    const incoming = repo({ status: 'done', indexedAt: '2026-06-01T01:00:00.000Z' })
    const merged = mergeRepositoryRecord(existing, incoming, 'detail')
    expect(merged.status).toBe('done')
    expect(merged.indexedAt).toBe('2026-06-01T01:00:00.000Z')
  })

  it('preserves detail-only fields when a list response lacks them', () => {
    const existing = repo({
      indexedAt: '2026-06-01T01:00:00.000Z',
      embeddingProfile: {
        provider: 'openrouter',
        model: 'nomic-embed-code',
        dimensions: 3584,
        endpoint: null,
        capturedAt: null,
      },
      embeddingCompatibility: { compatible: true, message: null },
      indexingFailure: { message: 'OpenRouter key limit exceeded.' },
    })
    const listResponse = repo({ status: 'failed', indexedAt: null })
    const merged = mergeRepositoryRecord(existing, listResponse, 'list')
    expect(merged.status).toBe('failed')
    expect(merged.indexedAt).toBe('2026-06-01T01:00:00.000Z')
    expect(merged.embeddingProfile?.model).toBe('nomic-embed-code')
    expect(merged.embeddingCompatibility?.compatible).toBe(true)
    expect(merged.indexingFailure?.message).toBe('OpenRouter key limit exceeded.')
  })
})

describe('repository list/detail store', () => {
  it('does not expose cached repositories before an owner is selected', () => {
    resetRepositoryCache()
    setRepositoryList([repo({ id: 'a' })])
    expect(getRepositoryList()).toBeNull()
    expect(getRepository('a')).toBeNull()
  })

  it('returns null before the list is loaded and the array after', () => {
    expect(getRepositoryList()).toBeNull()
    setRepositoryList([repo({ id: 'a' }), repo({ id: 'b' })])
    expect(getRepositoryList()?.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('seeds detail-by-id from a list response', () => {
    setRepositoryList([repo({ id: 'a', name: 'alpha' })])
    expect(getRepository('a')?.name).toBe('alpha')
  })

  it('does not let a later list response clobber a detail-only field', () => {
    setRepository(repo({ id: 'a', indexedAt: '2026-06-01T01:00:00.000Z' }))
    setRepositoryList([repo({ id: 'a', indexedAt: null })])
    expect(getRepository('a')?.indexedAt).toBe('2026-06-01T01:00:00.000Z')
  })

  it('removes a stale cached repository by id', () => {
    setRepositoryList([repo({ id: 'a' }), repo({ id: 'b' })])
    removeRepository('a')
    expect(getRepository('a')).toBeNull()
    expect(getRepositoryList()?.map((r) => r.id)).toEqual(['b'])
  })
})

describe('fetchRepositoryDetail', () => {
  it('deduplicates concurrent in-flight requests', async () => {
    let resolve: (value: RepositoryResponse) => void = () => {}
    const fetcher = vi.fn(() => new Promise<RepositoryResponse>((r) => { resolve = r }))
    const p1 = fetchRepositoryDetail('a', fetcher)
    const p2 = fetchRepositoryDetail('a', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    resolve(repo({ id: 'a' }))
    await Promise.all([p1, p2])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('skips the network inside the freshness window but refetches with force', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const fetcher = vi.fn(async () => repo({ id: 'a' }))
    await fetchRepositoryDetail('a', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)

    // 2s later — still inside the 5s window.
    vi.spyOn(Date, 'now').mockReturnValue(3_000)
    await fetchRepositoryDetail('a', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)

    // force bypasses freshness.
    await fetchRepositoryDetail('a', fetcher, { force: true })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('refetches once the freshness window has elapsed', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const fetcher = vi.fn(async () => repo({ id: 'a' }))
    await fetchRepositoryDetail('a', fetcher)
    vi.spyOn(Date, 'now').mockReturnValue(10_000)
    await fetchRepositoryDetail('a', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('keeps the forced refresh result when a superseded request resolves later', async () => {
    let resolveStale: (value: RepositoryResponse) => void = () => {}
    let resolveFresh: (value: RepositoryResponse) => void = () => {}
    const fetcher = vi
      .fn<[], Promise<RepositoryResponse>>()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveStale = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFresh = resolve }))

    const staleRequest = fetchRepositoryDetail('a', fetcher)
    const freshRequest = fetchRepositoryDetail('a', fetcher, { force: true })

    expect(fetcher).toHaveBeenCalledTimes(2)

    resolveFresh(repo({ id: 'a', name: 'fresh' }))
    await expect(freshRequest).resolves.toMatchObject({ name: 'fresh' })
    expect(getRepository('a')?.name).toBe('fresh')

    resolveStale(repo({ id: 'a', name: 'stale' }))
    await expect(staleRequest).resolves.toMatchObject({ name: 'stale' })
    expect(getRepository('a')?.name).toBe('fresh')
  })

  it('does not let a superseded request evict the active forced request', async () => {
    let resolveStale: (value: RepositoryResponse) => void = () => {}
    let resolveFresh: (value: RepositoryResponse) => void = () => {}
    const fetcher = vi
      .fn<[], Promise<RepositoryResponse>>()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveStale = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFresh = resolve }))

    const staleRequest = fetchRepositoryDetail('a', fetcher)
    const freshRequest = fetchRepositoryDetail('a', fetcher, { force: true })

    expect(fetcher).toHaveBeenCalledTimes(2)

    resolveStale(repo({ id: 'a', name: 'stale' }))
    await expect(staleRequest).resolves.toMatchObject({ name: 'stale' })
    expect(getRepository('a')).toBeNull()

    const dedupedRequest = fetchRepositoryDetail('a', fetcher)
    expect(dedupedRequest).toBe(freshRequest)
    expect(fetcher).toHaveBeenCalledTimes(2)

    resolveFresh(repo({ id: 'a', name: 'fresh' }))
    await expect(dedupedRequest).resolves.toMatchObject({ name: 'fresh' })
    expect(getRepository('a')?.name).toBe('fresh')
  })
})

describe('prefetchRepository', () => {
  it('fetches when no fresh detail exists', async () => {
    const fetcher = vi.fn(async () => repo({ id: 'a' }))
    prefetchRepository('a', fetcher)
    await Promise.resolve()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('does not fetch when a primed-then-fetched record is still fresh', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    primeRepositoryFromList(repo({ id: 'a' }))
    const fetcher = vi.fn(async () => repo({ id: 'a' }))
    await fetchRepositoryDetail('a', fetcher)
    prefetchRepository('a', fetcher)
    await Promise.resolve()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

function fakeSessionStorage(): Storage & { keys(): string[] } {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => store.delete(key),
    setItem: (key, value) => store.set(key, value),
    keys: () => [...store.keys()],
  }
}

describe('session mirror', () => {
  it('keeps session mirrors separate per authenticated user', () => {
    const sessionStorage = fakeSessionStorage()
    vi.stubGlobal('window', { sessionStorage })

    setRepositoryCacheOwner('user-a')
    setRepositoryList([repo({ id: 'a', name: 'Repo A' })])

    setRepositoryCacheOwner('user-b')
    setRepositoryList([repo({ id: 'b', name: 'Repo B' })])

    resetRepositoryCache()
    setRepositoryCacheOwner('user-a')
    loadSessionMirror()
    expect(getRepositoryList()?.map((repository) => repository.id)).toEqual(['a'])

    resetRepositoryCache()
    setRepositoryCacheOwner('user-b')
    loadSessionMirror()
    expect(getRepositoryList()?.map((repository) => repository.id)).toEqual(['b'])
  })

  it('clears the active owner cache and session mirror on sign-out', () => {
    const sessionStorage = fakeSessionStorage()
    vi.stubGlobal('window', { sessionStorage })

    setRepositoryCacheOwner('user-a')
    setRepositoryList([repo({ id: 'a' })])
    expect(getRepositoryList()?.length).toBe(1)

    clearRepositoryCache()
    expect(getRepositoryList()).toBeNull()
    expect([...sessionStorage.keys()]).not.toContain('convergekit.repository-cache.v1:user-a')
  })

  it('persists the list and restores it after the in-memory cache is reset', () => {
    const sessionStorage = fakeSessionStorage()
    vi.stubGlobal('window', { sessionStorage })

    setRepositoryList([repo({ id: 'a', name: 'alpha' })])
    resetRepositoryCache() // simulate a hard reload - memory and owner are empty
    expect(getRepositoryList()).toBeNull()

    setRepositoryCacheOwner('test-user')
    loadSessionMirror()
    expect(getRepositoryList()?.map((r) => r.id)).toEqual(['a'])
    expect(getRepository('a')?.name).toBe('alpha')
  })

  it('never overwrites live in-memory data', () => {
    const sessionStorage = fakeSessionStorage()
    vi.stubGlobal('window', { sessionStorage })

    setRepositoryList([repo({ id: 'a', name: 'from-memory' })])
    // Corrupt the mirror with different data; loadSessionMirror must ignore it
    // because memory is already populated.
    sessionStorage.setItem(
      'convergekit.repository-cache.v1:test-user',
      JSON.stringify({ listOrder: ['z'], repositories: [repo({ id: 'z', name: 'stale' })] }),
    )
    loadSessionMirror()
    expect(getRepository('a')?.name).toBe('from-memory')
    expect(getRepository('z')).toBeNull()
  })

  it('no-ops without a browser window', () => {
    // No window stub — node environment, window is undefined.
    expect(() => setRepository(repo({ id: 'a' }))).not.toThrow()
    expect(() => loadSessionMirror()).not.toThrow()
    expect(getRepository('a')?.id).toBe('a')
  })
})
