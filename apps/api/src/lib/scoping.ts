import { isAllowedAccessPolicyRepository } from '@convergekit/config/access-policy'
import { db, groupRepositories, repositories, user } from '@convergekit/db'
import { and, eq, isNull } from 'drizzle-orm'
import { ForbiddenError, NotFoundError } from '../errors.js'
import type { Executor } from './db-executor.js'

function filterAllowedRepositories<
  T extends { id?: string; repositoryId?: string; provider?: string; cloneUrl?: string },
>(rows: T[]): T[] {
  return rows.filter((row) => {
    if (!row.provider || !row.cloneUrl) return false
    return isAllowedAccessPolicyRepository({
      provider: row.provider,
      cloneUrl: row.cloneUrl,
    })
  })
}

/**
 * Returns the set of repository IDs a user is allowed to access.
 * - Admins: all non-deleted repositories.
 * - Users: repositories assigned to their group via groupRepositories.
 * - Users with no group: empty set (no access).
 */
export async function scopedRepositoryIds(
  userId: string,
  executor: Executor = db,
): Promise<Set<string>> {
  const dbUser = await executor
    .select({ role: user.role, groupId: user.groupId, deactivatedAt: user.deactivatedAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  if (!dbUser[0]) return new Set()

  const { role, groupId, deactivatedAt } = dbUser[0]
  if (deactivatedAt) return new Set()

  if (role === 'admin') {
    const repos = await executor
      .select({
        id: repositories.id,
        provider: repositories.provider,
        cloneUrl: repositories.cloneUrl,
      })
      .from(repositories)
      .where(isNull(repositories.deletedAt))
    return new Set(filterAllowedRepositories(repos).map((r) => r.id))
  }

  // Regular user — scope to group repos
  if (!groupId) return new Set()

  const repos = await executor
    .select({
      repositoryId: groupRepositories.repositoryId,
      provider: repositories.provider,
      cloneUrl: repositories.cloneUrl,
    })
    .from(groupRepositories)
    .innerJoin(repositories, eq(groupRepositories.repositoryId, repositories.id))
    .where(and(eq(groupRepositories.groupId, groupId), isNull(repositories.deletedAt)))

  return new Set(filterAllowedRepositories(repos).map((r) => r.repositoryId))
}

/**
 * Throws NotFoundError if the user doesn't have access to the given repository.
 * Returns 404 (not 403) to prevent repo enumeration.
 */
export async function assertRepoAccess(userId: string, repositoryId: string): Promise<void> {
  const allowed = await scopedRepositoryIds(userId)
  if (!allowed.has(repositoryId)) {
    throw new NotFoundError('Repository')
  }
}

/**
 * Repository-wide mutations are admin-only. Regular users may consume assigned
 * repositories and manage their own MCP tokens, but cannot change shared repo state.
 */
export async function assertRepoAdminAction(userId: string, repositoryId: string): Promise<void> {
  await assertRepoAccess(userId, repositoryId)

  const dbUser = await db.select({ role: user.role }).from(user).where(eq(user.id, userId)).limit(1)

  if (dbUser[0]?.role !== 'admin') {
    throw new ForbiddenError('Admin privileges required')
  }
}
