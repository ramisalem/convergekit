import type { RepositoryResponse } from '@convergekit/types'

export type RepositoryDetailFetcher = (id: string) => Promise<RepositoryResponse>

type RepositoryEntry = {
  repository: RepositoryResponse
  // Epoch ms of the last network response that populated this entry. 0 when the
  // entry was only seeded from list data and never refreshed from the detail API.
  fetchedAt: number
  // True once a detail response has populated this entry.
  hasDetail: boolean
}

const DETAIL_FRESHNESS_MS = 5_000
const SESSION_KEY_PREFIX = 'convergekit.repository-cache.v1'
const MAX_MIRRORED_ENTRIES = 20

type MirrorShape = {
  listOrder: string[] | null
  repositories: RepositoryResponse[]
}

const entries = new Map<string, RepositoryEntry>()
let listOrder: string[] | null = null
let activeOwnerId: string | null = null
const inFlight = new Map<string, Promise<RepositoryResponse>>()
const latestRequestGeneration = new Map<string, number>()
let requestSequence = 0

function getSessionKey(ownerId: string | null = activeOwnerId): string | null {
  return ownerId ? `${SESSION_KEY_PREFIX}:${ownerId}` : null
}

function clearMemoryCache(): void {
  entries.clear()
  listOrder = null
  inFlight.clear()
  latestRequestGeneration.clear()
}

function nextRequestGeneration(id: string): number {
  requestSequence += 1
  latestRequestGeneration.set(id, requestSequence)
  return requestSequence
}

export function setRepositoryCacheOwner(ownerId: string | null): void {
  if (activeOwnerId === ownerId) return
  clearMemoryCache()
  activeOwnerId = ownerId
  try {
    getSessionStorageSafe()?.removeItem(SESSION_KEY_PREFIX)
  } catch {
    // Best-effort cleanup of the old unscoped mirror.
  }
}

export function clearRepositoryCache(): void {
  const storage = getSessionStorageSafe()
  const key = getSessionKey()
  clearMemoryCache()
  if (key) {
    try {
      storage?.removeItem(key)
    } catch {
      // Best-effort.
    }
  }
  activeOwnerId = null
}

/**
 * Field-level merge. Detail responses are authoritative and may overwrite any
 * field. List responses update summary fields but must never delete detail-only
 * fields the list endpoint does not return.
 */
export function mergeRepositoryRecord(
  existing: RepositoryResponse | undefined,
  incoming: RepositoryResponse,
  tier: 'list' | 'detail',
): RepositoryResponse {
  if (!existing) return { ...incoming }
  if (tier === 'detail') return { ...existing, ...incoming }

  const merged: RepositoryResponse = { ...existing, ...incoming }
  if (incoming.indexedAt == null && existing.indexedAt != null) {
    merged.indexedAt = existing.indexedAt
  }
  if (incoming.embeddingProfile == null && existing.embeddingProfile != null) {
    merged.embeddingProfile = existing.embeddingProfile
  }
  if (incoming.embeddingCompatibility == null && existing.embeddingCompatibility != null) {
    merged.embeddingCompatibility = existing.embeddingCompatibility
  }
  if (incoming.indexingFailure == null && existing.indexingFailure != null) {
    merged.indexingFailure = existing.indexingFailure
  }
  return merged
}

function upsert(repository: RepositoryResponse, tier: 'list' | 'detail'): void {
  const existing = entries.get(repository.id)
  entries.set(repository.id, {
    repository: mergeRepositoryRecord(existing?.repository, repository, tier),
    fetchedAt: tier === 'detail' ? Date.now() : existing?.fetchedAt ?? 0,
    hasDetail: tier === 'detail' ? true : existing?.hasDetail ?? false,
  })
}

export function getRepositoryList(): RepositoryResponse[] | null {
  if (!activeOwnerId || listOrder === null) return null
  return listOrder
    .map((id) => entries.get(id)?.repository)
    .filter((repository): repository is RepositoryResponse => repository != null)
}

export function setRepositoryList(repositories: RepositoryResponse[]): void {
  if (!activeOwnerId) return
  for (const repository of repositories) upsert(repository, 'list')
  listOrder = repositories.map((repository) => repository.id)
  writeSessionMirror()
}

export function getRepository(id: string): RepositoryResponse | null {
  if (!activeOwnerId) return null
  return entries.get(id)?.repository ?? null
}

export function setRepository(repository: RepositoryResponse): void {
  if (!activeOwnerId) return
  upsert(repository, 'detail')
  writeSessionMirror()
}

export function removeRepository(id: string): void {
  if (!activeOwnerId) return
  entries.delete(id)
  inFlight.delete(id)
  latestRequestGeneration.delete(id)
  if (listOrder !== null) {
    listOrder = listOrder.filter((repositoryId) => repositoryId !== id)
  }
  writeSessionMirror()
}

export function primeRepositoryFromList(repository: RepositoryResponse): void {
  if (!activeOwnerId) return
  upsert(repository, 'list')
}

function isDetailFresh(id: string): boolean {
  const entry = entries.get(id)
  if (!entry || !entry.hasDetail) return false
  return Date.now() - entry.fetchedAt < DETAIL_FRESHNESS_MS
}

/**
 * Single entry point for all detail fetches (hover prefetch, mount refresh,
 * polling). Shares one in-flight map so concurrent callers reuse one request,
 * and honors a short freshness window unless `force` is set.
 */
export function fetchRepositoryDetail(
  id: string,
  fetcher: RepositoryDetailFetcher,
  options: { force?: boolean } = {},
): Promise<RepositoryResponse> {
  if (!activeOwnerId) return fetcher(id)
  const pending = inFlight.get(id)
  if (pending && !options.force) return pending
  if (!options.force && isDetailFresh(id)) {
    return Promise.resolve(entries.get(id)!.repository)
  }
  const generation = nextRequestGeneration(id)
  const request = fetcher(id)
    .then((repository) => {
      if (latestRequestGeneration.get(id) === generation) {
        setRepository(repository)
      }
      return repository
    })
    .finally(() => {
      if (inFlight.get(id) === request) {
        inFlight.delete(id)
      }
    })
  inFlight.set(id, request)
  return request
}

/** Fire-and-forget warm-up used on row hover/focus. Errors are intentionally swallowed. */
export function prefetchRepository(id: string, fetcher: RepositoryDetailFetcher): void {
  void fetchRepositoryDetail(id, fetcher).catch(() => {})
}

function getSessionStorageSafe(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage
  } catch {
    return null
  }
}

function writeSessionMirror(): void {
  const storage = getSessionStorageSafe()
  const key = getSessionKey()
  if (!storage || !key) return

  const ids = new Set<string>(listOrder ?? [])
  const recentDetailIds = [...entries.entries()]
    .filter(([, entry]) => entry.hasDetail)
    .sort((a, b) => b[1].fetchedAt - a[1].fetchedAt)
    .map(([id]) => id)
  for (const id of recentDetailIds) {
    if (ids.size >= MAX_MIRRORED_ENTRIES) break
    ids.add(id)
  }

  const payload: MirrorShape = {
    listOrder,
    repositories: [...ids]
      .map((id) => entries.get(id)?.repository)
      .filter((repository): repository is RepositoryResponse => repository != null),
  }
  try {
    storage.setItem(key, JSON.stringify(payload))
  } catch {
    // Best-effort — ignore quota/serialization failures.
  }
}

/**
 * Hydration-safe restore. MUST be called from an effect (after hydration),
 * never from a render-time initializer, because `sessionStorage` is unavailable
 * during SSR. No-ops when in-memory data already exists.
 */
export function loadSessionMirror(): void {
  if (!activeOwnerId || listOrder !== null || entries.size > 0) return
  const storage = getSessionStorageSafe()
  const key = getSessionKey()
  if (!storage || !key) return
  const raw = storage.getItem(key)
  if (!raw) return
  try {
    const parsed = JSON.parse(raw) as MirrorShape
    for (const repository of parsed.repositories ?? []) {
      entries.set(repository.id, { repository, fetchedAt: 0, hasDetail: false })
    }
    listOrder = parsed.listOrder ?? null
  } catch {
    // Corrupt mirror — ignore.
  }
}

/** Test-only: clears all in-memory state. */
export function resetRepositoryCache(): void {
  clearMemoryCache()
  activeOwnerId = null
}
