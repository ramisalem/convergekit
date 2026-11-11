import type { FactoryGitHub } from '@convergekit/factory/github'

/**
 * Who may open the Factory module: collaborators on the configured access repo.
 *
 * The check uses the factory's service token, so it also works for read-only collaborators
 * (GitHub only lets users with push access call the collaborator endpoint themselves).
 * Results are cached so a removed collaborator loses access within MEMBER_TTL_SECONDS,
 * and a newly added one gets in within NON_MEMBER_TTL_SECONDS.
 */

export const MEMBER_TTL_SECONDS = 15 * 60
export const NON_MEMBER_TTL_SECONDS = 60

export type FactoryAccessReason =
  | 'no_github_account'
  | 'unknown_github_account'
  | 'not_collaborator'
  | 'github_error'

export type FactoryAccess =
  | { member: true; login: string; reason: null }
  | { member: false; login: string | null; reason: FactoryAccessReason }

export type FactoryCache = {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
}

export type FactoryAccessDeps = {
  accessRepo: string
  github: Pick<FactoryGitHub, 'getLoginById' | 'isCollaborator'>
  cache: FactoryCache
  /** The numeric GitHub account id linked to this user, if any. */
  findGitHubAccountId(userId: string): Promise<string | null>
}

export function factoryAccessCacheKey(accessRepo: string, userId: string) {
  return `factory:access:v1:${accessRepo.toLowerCase()}:${userId}`
}

function isFactoryAccess(value: unknown): value is FactoryAccess {
  return typeof value === 'object' && value !== null && 'member' in value && 'reason' in value
}

export async function resolveFactoryAccess(
  userId: string,
  deps: FactoryAccessDeps,
): Promise<FactoryAccess> {
  const key = factoryAccessCacheKey(deps.accessRepo, userId)

  const cached = await deps.cache.get(key).catch(() => null)
  if (cached) {
    try {
      const parsed: unknown = JSON.parse(cached)
      if (isFactoryAccess(parsed)) return parsed
    } catch {
      // fall through to a fresh check
    }
  }

  const access = await checkFactoryAccess(userId, deps)

  // GitHub errors are not cached, so the next request tries again.
  if (access.reason !== 'github_error') {
    const ttl = access.member ? MEMBER_TTL_SECONDS : NON_MEMBER_TTL_SECONDS
    await deps.cache.set(key, JSON.stringify(access), ttl).catch(() => undefined)
  }

  return access
}

async function checkFactoryAccess(userId: string, deps: FactoryAccessDeps): Promise<FactoryAccess> {
  const accountId = await deps.findGitHubAccountId(userId)
  if (!accountId) return { member: false, login: null, reason: 'no_github_account' }

  try {
    const login = await deps.github.getLoginById(accountId)
    if (!login) return { member: false, login: null, reason: 'unknown_github_account' }

    const member = await deps.github.isCollaborator(deps.accessRepo, login)
    return member
      ? { member: true, login, reason: null }
      : { member: false, login, reason: 'not_collaborator' }
  } catch {
    return { member: false, login: null, reason: 'github_error' }
  }
}
