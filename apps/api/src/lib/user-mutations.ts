import { user, type User } from '@convergekit/db'
import { asc, eq, inArray } from 'drizzle-orm'
import type { Executor, TxHooks } from './db-executor.js'
import { revokeGrantsForUser } from './mcp-oauth-store.js'
import {
  revokeActiveMcpTokensForUser,
  revokeActiveMcpTokensForUsers,
  revokeMcpTokensNoLongerAllowed,
} from './mcp-token-security.js'

// Extracted, hookable transaction bodies for the user-management mutations that
// must revoke MCP access atomically with the DB write that changes it — mirrors
// the ci-token-service.ts seam (lock -> afterLock -> reads/writes -> beforeCommit)
// so the integration suite can inject race/rollback hooks by calling these
// directly (hooks cannot traverse an HTTP route). Routes in users.ts only open a
// `db.transaction` and delegate here — the one lock primitive they touch is the
// exported lockUsers, taken first when a route folds extra field writes into the
// same transaction. No route authors its own FOR UPDATE or transaction body.

/**
 * Deterministic-order row lock shared by every mutation below (avoids deadlocks
 * on overlapping bulk sets). Call as the FIRST statement of any transaction that
 * touches multiple user rows — any plain UPDATE issued before it would acquire
 * its row locks in planner scan order, defeating the ORDER BY id guarantee.
 */
export function lockUsers(executor: Executor, userIds: string[]) {
  return executor
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.id, userIds))
    .orderBy(asc(user.id))
    .for('update') // SELECT … FOR UPDATE
}

/**
 * Locks the users (id order), sets ci_tokens_enabled=false, then revokes tokens
 * no longer allowed for them (reason 'ci_tokens_disabled'): this always sweeps
 * their user-level (repository_id IS NULL) rows since the flag just went false,
 * and additionally sweeps any legacy repo-scoped rows whose repo access is also
 * gone. Returns the updated user rows.
 */
export async function disableCapability(executor: Executor, userIds: string[], hooks?: TxHooks) {
  await lockUsers(executor, userIds)
  await hooks?.afterLock?.()

  const updated = await executor
    .update(user)
    .set({ ciTokensEnabled: false, updatedAt: new Date() })
    .where(inArray(user.id, userIds))
    .returning()

  await revokeMcpTokensNoLongerAllowed(userIds, 'ci_tokens_disabled', executor)

  await hooks?.beforeCommit?.()
  return updated
}

/**
 * Locks the users (id order), sets deactivated_at, revokes BOTH static token
 * shapes (reason 'user_deactivated') and the users' OAuth grants. Returns the
 * updated rows plus the count of static tokens revoked (single-deactivate's
 * response surfaces that count; bulk only needs the ids).
 */
export async function deactivateUsers(executor: Executor, userIds: string[], hooks?: TxHooks) {
  const locked = await lockUsers(executor, userIds)
  await hooks?.afterLock?.()
  // Nothing locked = every id is missing: skip the three no-op sweeps
  // (revokeAllForUser style); routes still 404 off the empty result.
  if (locked.length === 0) return { users: [] as User[], tokensRevoked: 0 }

  const users = await executor
    .update(user)
    .set({ deactivatedAt: new Date(), updatedAt: new Date() })
    .where(inArray(user.id, userIds))
    .returning()

  const tokensRevoked = await revokeActiveMcpTokensForUsers(userIds, 'user_deactivated', executor)
  for (const id of userIds) {
    await revokeGrantsForUser(id, 'user_deactivated', executor)
  }

  await hooks?.beforeCommit?.()
  return { users, tokensRevoked }
}

/**
 * Locks the user row, sets ci_tokens_enabled=false, revokes both static token
 * shapes (reason 'admin_user_revoke_all') — a static-token kill-switch that also
 * blocks re-creation until an admin re-enables. OAuth grants are left untouched
 * (deactivation is the full static+OAuth shutdown). Returns null if the user no
 * longer exists (lock finds no row), otherwise the count of tokens revoked.
 */
export async function revokeAllForUser(executor: Executor, userId: string, hooks?: TxHooks) {
  const locked = await lockUsers(executor, [userId])
  await hooks?.afterLock?.()
  if (locked.length === 0) return null

  await executor
    .update(user)
    .set({ ciTokensEnabled: false, updatedAt: new Date() })
    .where(eq(user.id, userId))

  const revoked = await revokeActiveMcpTokensForUser(userId, 'admin_user_revoke_all', executor)

  await hooks?.beforeCommit?.()
  return revoked
}
