import { closeDbConnection, db, mcpTokens, user } from '@convergekit/db'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createUserLevelToken } from '../lib/ci-token-service.js'
import { deactivateUsers, disableCapability, lockUsers } from '../lib/user-mutations.js'
import { createBarrier, makeFixture, waitUntil } from './support.js'

// Real-Postgres integration suite (Task 15b, file 1 of 3): races + atomicity
// between the row-locked CI-token create/renew seam (ci-token-service.ts) and
// the user-management mutations (user-mutations.ts). Hooks cannot traverse
// HTTP, so every scenario here invokes the EXTRACTED transaction functions
// directly — see apps/api/src/integration/support.ts for the seed/barrier
// helpers and the rationale for per-file email prefixes + fileParallelism:false.
//
// Connects to the SHARED local dev database via DATABASE_URL. Every seed is
// tagged `it-15b-races-*` and torn down by exact id — NEVER truncate a shared
// table wholesale.

const fx = makeFixture('races')

async function unrevokedUserLevelTokenCount(userId: string): Promise<number> {
  const rows = await db
    .select({ id: mcpTokens.id })
    .from(mcpTokens)
    .where(
      and(
        eq(mcpTokens.userId, userId),
        isNull(mcpTokens.repositoryId),
        isNull(mcpTokens.revokedAt),
      ),
    )
  return rows.length
}

async function ciTokensEnabledFor(userId: string): Promise<boolean | undefined> {
  const [row] = await db
    .select({ ciTokensEnabled: user.ciTokensEnabled })
    .from(user)
    .where(eq(user.id, userId))
  return row?.ciTokensEnabled
}

describe('ci-token races: create-vs-mutation (real Postgres)', () => {
  const seededUserIds: string[] = []

  beforeAll(async () => {
    await fx.sweepLeftovers()
  })

  afterAll(async () => {
    await fx.deleteUsers(seededUserIds)
  })

  describe('create-vs-disable', () => {
    it('disableCapability blocks behind an in-flight createUserLevelToken; its in-tx sweep then revokes the just-created token; re-enabling the flag does not resurrect it', async () => {
      const owner = await fx.seedUser({ ciTokensEnabled: true })
      seededUserIds.push(owner.id)

      const barrier = createBarrier()
      const createPromise = db.transaction((tx) =>
        createUserLevelToken(tx, { userId: owner.id, label: 'race token' }, barrier.hooks),
      )
      await waitUntil(() => barrier.isReached())

      let disableResolved = false
      const disablePromise = db
        .transaction((tx) => disableCapability(tx, [owner.id]))
        .then((r) => {
          disableResolved = true
          return r
        })

      // disableCapability's lockUsers wants the SAME row createUserLevelToken
      // is holding via its own SELECT ... FOR UPDATE (parked in the barrier) —
      // it must still be unresolved after a beat. releaseA-style: the barrier
      // MUST release even if this assertion throws, or the held transaction
      // hangs forever on the shared dev DB.
      try {
        await new Promise((resolve) => setTimeout(resolve, 300))
        expect(disableResolved).toBe(false)
      } finally {
        barrier.release()
      }

      const created = await createPromise
      await disablePromise

      expect(created).not.toBeNull()

      // END STATE: no unrevoked user-level row for this user; flag false.
      expect(await unrevokedUserLevelTokenCount(owner.id)).toBe(0)
      expect(await ciTokensEnabledFor(owner.id)).toBe(false)

      const tokenId = created!.tokenDetails.id
      const [beforeReenable] = await db
        .select({ revokedAt: mcpTokens.revokedAt, revokedReason: mcpTokens.revokedReason })
        .from(mcpTokens)
        .where(eq(mcpTokens.id, tokenId))
      expect(beforeReenable?.revokedAt).not.toBeNull()
      expect(beforeReenable?.revokedReason).toBe('ci_tokens_disabled')

      // Re-enable the flag directly (mirrors an admin re-flipping it) -> the
      // already-revoked token must not come back.
      await db.update(user).set({ ciTokensEnabled: true }).where(eq(user.id, owner.id))
      const [afterReenable] = await db
        .select({ revokedAt: mcpTokens.revokedAt })
        .from(mcpTokens)
        .where(eq(mcpTokens.id, tokenId))
      expect(afterReenable?.revokedAt).not.toBeNull()
    }, 15000)
  })

  describe('create-vs-deactivation', () => {
    it('single deactivateUsers blocks behind an in-flight createUserLevelToken, then revokes; reactivation does not resurrect', async () => {
      const owner = await fx.seedUser({ ciTokensEnabled: true })
      seededUserIds.push(owner.id)

      const barrier = createBarrier()
      const createPromise = db.transaction((tx) =>
        createUserLevelToken(tx, { userId: owner.id, label: 'race token single' }, barrier.hooks),
      )
      await waitUntil(() => barrier.isReached())

      let resolved = false
      const deactivatePromise = db
        .transaction((tx) => deactivateUsers(tx, [owner.id]))
        .then((r) => {
          resolved = true
          return r
        })

      try {
        await new Promise((resolve) => setTimeout(resolve, 300))
        expect(resolved).toBe(false)
      } finally {
        barrier.release()
      }

      const created = await createPromise
      await deactivatePromise

      expect(created).not.toBeNull()
      expect(await unrevokedUserLevelTokenCount(owner.id)).toBe(0)

      const tokenId = created!.tokenDetails.id
      const [revokedRow] = await db
        .select({ revokedAt: mcpTokens.revokedAt, revokedReason: mcpTokens.revokedReason })
        .from(mcpTokens)
        .where(eq(mcpTokens.id, tokenId))
      expect(revokedRow?.revokedAt).not.toBeNull()
      expect(revokedRow?.revokedReason).toBe('user_deactivated')

      // Reactivate (clear deactivatedAt directly) -> resurrects nothing.
      await db.update(user).set({ deactivatedAt: null }).where(eq(user.id, owner.id))
      const [afterReactivate] = await db
        .select({ revokedAt: mcpTokens.revokedAt })
        .from(mcpTokens)
        .where(eq(mcpTokens.id, tokenId))
      expect(afterReactivate?.revokedAt).not.toBeNull()
    }, 15000)

    it('bulk deactivateUsers (3 users incl. the target) blocks behind an in-flight createUserLevelToken, then revokes the target; reactivation does not resurrect', async () => {
      const owner = await fx.seedUser({ ciTokensEnabled: true })
      const pad1 = await fx.seedUser()
      const pad2 = await fx.seedUser()
      seededUserIds.push(owner.id, pad1.id, pad2.id)

      const barrier = createBarrier()
      const createPromise = db.transaction((tx) =>
        createUserLevelToken(tx, { userId: owner.id, label: 'race token bulk' }, barrier.hooks),
      )
      await waitUntil(() => barrier.isReached())

      let resolved = false
      const bulkIds = [owner.id, pad1.id, pad2.id]
      const deactivatePromise = db
        .transaction((tx) => deactivateUsers(tx, bulkIds))
        .then((r) => {
          resolved = true
          return r
        })

      try {
        await new Promise((resolve) => setTimeout(resolve, 300))
        expect(resolved).toBe(false)
      } finally {
        barrier.release()
      }

      const created = await createPromise
      const result = await deactivatePromise

      expect(created).not.toBeNull()
      expect(result.users.map((u) => u.id).sort()).toEqual([...bulkIds].sort())
      expect(await unrevokedUserLevelTokenCount(owner.id)).toBe(0)

      const tokenId = created!.tokenDetails.id
      await db.update(user).set({ deactivatedAt: null }).where(eq(user.id, owner.id))
      const [afterReactivate] = await db
        .select({ revokedAt: mcpTokens.revokedAt })
        .from(mcpTokens)
        .where(eq(mcpTokens.id, tokenId))
      expect(afterReactivate?.revokedAt).not.toBeNull()
    }, 15000)
  })
})

describe('ci-token races: bulk-vs-bulk overlap, opposite orders (real Postgres)', () => {
  const seededUserIds: string[] = []

  beforeAll(async () => {
    await fx.sweepLeftovers()
  })

  afterAll(async () => {
    await fx.deleteUsers(seededUserIds)
  })

  it("two overlapping bulk compositions in opposite id orders both complete without deadlock (lockUsers' ORDER BY id neutralizes it)", async () => {
    const a = await fx.seedUser({ ciTokensEnabled: true })
    const b = await fx.seedUser({ ciTokensEnabled: true })
    seededUserIds.push(a.id, b.id)

    // Mirrors PATCH /api/users/bulk's transaction shape exactly: lockUsers
    // FIRST, then a plain patch write, then the mutation helper — but each
    // composition passes the SAME two ids in the OPPOSITE order, and ends in
    // a DIFFERENT terminal mutation (deactivate vs disable) so both effects
    // are independently observable afterward.
    const deactivateComposition = db.transaction(async (tx) => {
      await lockUsers(tx, [a.id, b.id])
      await tx
        .update(user)
        .set({ name: 'it-15b-races patched-by-deactivate-composition', updatedAt: new Date() })
        .where(inArray(user.id, [a.id, b.id]))
      return deactivateUsers(tx, [a.id, b.id])
    })

    const disableComposition = db.transaction(async (tx) => {
      await lockUsers(tx, [b.id, a.id])
      await tx
        .update(user)
        .set({ name: 'it-15b-races patched-by-disable-composition', updatedAt: new Date() })
        .where(inArray(user.id, [b.id, a.id]))
      return disableCapability(tx, [b.id, a.id])
    })

    const results = await Promise.allSettled([deactivateComposition, disableComposition])

    for (const result of results) {
      if (result.status === 'rejected') {
        throw new Error(
          `bulk-vs-bulk composition rejected (expected both to complete without deadlock): ${String(result.reason)}`,
        )
      }
    }
    expect(results[0]!.status).toBe('fulfilled')
    expect(results[1]!.status).toBe('fulfilled')

    // Both compositions touch both users: deactivate sets deactivatedAt (does
    // not touch ciTokensEnabled), disable sets ciTokensEnabled=false (does not
    // touch deactivatedAt) — orthogonal, so after both complete (regardless of
    // interleaving) both users show both effects.
    const rows = await db
      .select({
        id: user.id,
        deactivatedAt: user.deactivatedAt,
        ciTokensEnabled: user.ciTokensEnabled,
      })
      .from(user)
      .where(inArray(user.id, [a.id, b.id]))
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.deactivatedAt).not.toBeNull()
      expect(row.ciTokensEnabled).toBe(false)
    }
  }, 15000)
})

// File-level: close the shared `db` connection exactly ONCE, after every
// describe block in this file has finished — closing it per-describe-block
// would tear down the module-level singleton out from under whichever block
// runs next in the SAME file (module registries are isolated per test FILE,
// not per describe block).
afterAll(async () => {
  await closeDbConnection()
})
