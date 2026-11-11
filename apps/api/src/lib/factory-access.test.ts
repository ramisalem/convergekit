import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  factoryAccessCacheKey,
  MEMBER_TTL_SECONDS,
  NON_MEMBER_TTL_SECONDS,
  resolveFactoryAccess,
  type FactoryAccessDeps,
  type FactoryCache,
} from './factory-access.js'

type Entry = { value: string; expiresAt: number }

/** In-memory cache with a fake clock, so tests can move time forward. */
function memoryCache(now: () => number) {
  const store = new Map<string, Entry>()
  const cache: FactoryCache & { ttls: Map<string, number> } = {
    ttls: new Map(),
    async get(key) {
      const entry = store.get(key)
      if (!entry || entry.expiresAt <= now()) return null
      return entry.value
    },
    async set(key, value, ttlSeconds) {
      cache.ttls.set(key, ttlSeconds)
      store.set(key, { value, expiresAt: now() + ttlSeconds * 1000 })
    },
  }
  return cache
}

let clock = 0
let collaborators: Set<string>
let deps: FactoryAccessDeps & { cache: ReturnType<typeof memoryCache> }

beforeEach(() => {
  clock = 0
  collaborators = new Set(['pat-owner'])
  deps = {
    accessRepo: 'acme/factory-hub',
    cache: memoryCache(() => clock),
    findGitHubAccountId: vi.fn(async (userId: string) => (userId === 'no-gh' ? null : '42')),
    github: {
      getLoginById: vi.fn(async (id: string) => (id === '42' ? 'pat-owner' : null)),
      isCollaborator: vi.fn(async (_repo: string, login: string) => collaborators.has(login)),
    },
  }
})

describe('resolveFactoryAccess', () => {
  it('lets a collaborator in and caches the answer for 15 minutes', async () => {
    await expect(resolveFactoryAccess('u1', deps)).resolves.toEqual({
      member: true,
      login: 'pat-owner',
      reason: null,
    })
    expect(deps.github.isCollaborator).toHaveBeenCalledWith('acme/factory-hub', 'pat-owner')
    expect(deps.cache.ttls.get(factoryAccessCacheKey('acme/factory-hub', 'u1'))).toBe(
      MEMBER_TTL_SECONDS,
    )

    await resolveFactoryAccess('u1', deps)
    expect(deps.github.isCollaborator).toHaveBeenCalledTimes(1)
  })

  it('locks out a removed collaborator within 15 minutes', async () => {
    await resolveFactoryAccess('u1', deps)
    collaborators.clear()

    clock += (MEMBER_TTL_SECONDS - 1) * 1000
    expect((await resolveFactoryAccess('u1', deps)).member).toBe(true)

    clock += 2000
    await expect(resolveFactoryAccess('u1', deps)).resolves.toEqual({
      member: false,
      login: 'pat-owner',
      reason: 'not_collaborator',
    })
  })

  it('re-checks a non-member after a minute, so a newly added collaborator gets in', async () => {
    collaborators.clear()
    expect((await resolveFactoryAccess('u1', deps)).member).toBe(false)
    expect(deps.cache.ttls.get(factoryAccessCacheKey('acme/factory-hub', 'u1'))).toBe(
      NON_MEMBER_TTL_SECONDS,
    )

    collaborators.add('pat-owner')
    clock += NON_MEMBER_TTL_SECONDS * 1000
    expect((await resolveFactoryAccess('u1', deps)).member).toBe(true)
  })

  it('refuses users without a linked GitHub account', async () => {
    await expect(resolveFactoryAccess('no-gh', deps)).resolves.toEqual({
      member: false,
      login: null,
      reason: 'no_github_account',
    })
    expect(deps.github.getLoginById).not.toHaveBeenCalled()
  })

  it('fails closed on GitHub errors and does not cache them', async () => {
    vi.mocked(deps.github.isCollaborator).mockRejectedValueOnce(new Error('502'))
    await expect(resolveFactoryAccess('u1', deps)).resolves.toMatchObject({
      member: false,
      reason: 'github_error',
    })
    expect(deps.cache.ttls.size).toBe(0)

    expect((await resolveFactoryAccess('u1', deps)).member).toBe(true)
  })

  it('still answers when the cache is down', async () => {
    deps.cache.get = vi.fn().mockRejectedValue(new Error('redis down'))
    deps.cache.set = vi.fn().mockRejectedValue(new Error('redis down'))
    expect((await resolveFactoryAccess('u1', deps)).member).toBe(true)
  })

  it('ignores a corrupt cache entry', async () => {
    await deps.cache.set(factoryAccessCacheKey('acme/factory-hub', 'u1'), '{nope', 60)
    expect((await resolveFactoryAccess('u1', deps)).member).toBe(true)
  })
})
