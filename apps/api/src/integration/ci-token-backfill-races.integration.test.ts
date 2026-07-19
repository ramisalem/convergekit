import { closeDbConnection, db, mcpOauthToken, mcpTokens, user } from '@convergekit/db'
import {
  BackfillCountMismatchError,
  runCiTokenCapabilityBackfill,
} from '@convergekit/db/backfill-ci-token-capability'
import { and, eq, isNull } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deactivateUsers } from '../lib/user-mutations.js'
import {
  countUserTableLocks,
  createBarrier,
  deleteBackfillMarkerRow,
  getAmbientCohortIds,
  getBackfillMarkerRowCount,
  getFlagOnUserIds,
  makeFixture,
  resetCiTokensEnabledFlag,
  waitUntil,
} from './support.js'

// Real-Postgres integration suite (Task 15b, file 3 of 3): the three possible
// orderings between the one-time capability backfill
// (runCiTokenCapabilityBackfill, which takes `LOCK TABLE "user" IN EXCLUSIVE
// MODE` as its first statement) and a concurrent bulk deactivateUsers (which
// enters via `SELECT ... FOR UPDATE`, table-level ROW SHARE). This pins the
// exact PostgreSQL lock-queue behavior the backfill's design comment
// describes and claims was "verified empirically on pgvector/pgvector:pg16" —
// this suite is that verification, made permanent and regression-proof.
//
// Direct function invocation throughout (hooks cannot traverse HTTP).
// Connects to the SHARED local dev database via DATABASE_URL. Every seed is
// tagged `it-15b-backfill-*`; the backfill's marker row (manual_migrations,
// filename 0024_ci_token_capability_backfill) and any granted
// `ci_tokens_enabled` flags are cleaned up after EVERY variant, not just at
// suite end — the marker MUST NOT persist in the shared dev DB.

const fx = makeFixture('backfill')

async function ciTokensEnabledFor(userId: string): Promise<boolean | undefined> {
  const [row] = await db
    .select({ ciTokensEnabled: user.ciTokensEnabled })
    .from(user)
    .where(eq(user.id, userId))
  return row?.ciTokensEnabled
}

async function unrevokedTokenCount(userId: string): Promise<number> {
  const rows = await db
    .select({ id: mcpTokens.id })
    .from(mcpTokens)
    .where(and(eq(mcpTokens.userId, userId), isNull(mcpTokens.revokedAt)))
  return rows.length
}

async function grantRevokedAtForUser(userId: string): Promise<Date | null | undefined> {
  const [row] = await db
    .select({ revokedAt: mcpOauthToken.revokedAt })
    .from(mcpOauthToken)
    .where(eq(mcpOauthToken.userId, userId))
  return row?.revokedAt
}

/** Seeds a user eligible for the backfill cohort: not deactivated, owns one
 * recently-used per-repo token that isn't revoked. */
async function seedCohortEligibleUser() {
  const owner = await fx.seedUser()
  const repo = await fx.seedRepository(owner.id)
  await fx.seedToken(owner.id, { repositoryId: repo.id, lastUsedAt: new Date() })
  const grant = await fx.seedOAuthGrant(owner.id)
  return { owner, repo, grant }
}

describe('ci-token backfill races: backfill vs bulk deactivateUsers, all three orderings (real Postgres)', () => {
  const seededUserIds: string[] = []

  beforeAll(async () => {
    await fx.sweepLeftovers()
    // Belt-and-suspenders: a crashed prior run of this file may have left the
    // marker behind too — the per-test finally blocks are the primary
    // cleanup, this is just the safety net.
    await deleteBackfillMarkerRow()
  })

  afterAll(async () => {
    await fx.deleteUsers(seededUserIds)
    await closeDbConnection()
  })

  it('(a) backfill holds EXCLUSIVE first; deactivateUsers blocks at its FOR-UPDATE entry holding nothing; both complete, no deadlock', async () => {
    const ambientIds = await getAmbientCohortIds()
    const flagOnBefore = await getFlagOnUserIds()
    const { owner } = await seedCohortEligibleUser()
    seededUserIds.push(owner.id)
    const expectedCount = ambientIds.size + 1

    let grantedIds: string[] = []
    try {
      const barrier = createBarrier()
      const backfillPromise = db.transaction((tx) =>
        runCiTokenCapabilityBackfill(tx, { reportOnly: false, expectedCount }, barrier.hooks),
      )
      await waitUntil(() => barrier.isReached())

      let deactivateResolved = false
      const deactivatePromise = db
        .transaction((tx) => deactivateUsers(tx, [owner.id]))
        .then((r) => {
          deactivateResolved = true
          return r
        })

      try {
        // deactivateUsers' lockUsers (SELECT ... FOR UPDATE) wants ROW SHARE
        // on "user", which conflicts with the backfill's held EXCLUSIVE — it
        // must be queued, holding NOTHING (row locks live in tuple headers,
        // not pg_locks; only the relation-level wait is observable here).
        await waitUntil(async () => (await countUserTableLocks('RowShareLock', false)) > 0, 5000)
        expect(await countUserTableLocks('RowShareLock', false)).toBeGreaterThan(0)
        expect(await countUserTableLocks('RowShareLock', true)).toBe(0)
        expect(deactivateResolved).toBe(false)
      } finally {
        barrier.release()
      }

      const backfillResult = await backfillPromise
      const deactivateResult = await deactivatePromise

      grantedIds = backfillResult.cohort.map((row) => row.id)

      expect(backfillResult.outcome).toBe('granted')
      expect(backfillResult.cohort.some((row) => row.id === owner.id)).toBe(true)
      expect(deactivateResult.users.map((u) => u.id)).toEqual([owner.id])

      // End state: the overlapping user may be flag-true AND deactivated —
      // the backfill's cohort SELECT ran (and granted) before deactivateUsers'
      // UPDATE committed, so it saw the user as still-eligible. Do NOT assert
      // "no deactivated user ends granted" — that is not what this ordering
      // produces, by design.
      expect(await ciTokensEnabledFor(owner.id)).toBe(true)
      const [refreshedUser] = await db
        .select({ deactivatedAt: user.deactivatedAt })
        .from(user)
        .where(eq(user.id, owner.id))
      expect(refreshedUser?.deactivatedAt).not.toBeNull()

      // deactivateUsers' revoke sweep still ran and caught everything.
      expect(await unrevokedTokenCount(owner.id)).toBe(0)
      expect(await grantRevokedAtForUser(owner.id)).not.toBeNull()
    } finally {
      // Restore, don't force-false: an ambient dev-DB user with the flag
      // legitimately on must not be disabled by our cleanup.
      await resetCiTokensEnabledFlag(grantedIds.filter((id) => !flagOnBefore.has(id)))
      await deleteBackfillMarkerRow()
      expect(await getBackfillMarkerRowCount()).toBe(0)
    }
  }, 20000)

  it('(b) deactivation completes fully first; backfill with the pre-deactivation expectedCount throws BackfillCountMismatchError, no flag change, no marker', async () => {
    const ambientIds = await getAmbientCohortIds()
    const { owner } = await seedCohortEligibleUser()
    seededUserIds.push(owner.id)
    // Computed BEFORE deactivation, while the user was still cohort-eligible
    // — the backfill's cohort will now exclude them (deactivated_at set).
    const expectedCount = ambientIds.size + 1

    await db.transaction((tx) => deactivateUsers(tx, [owner.id]))

    try {
      await expect(
        db.transaction((tx) =>
          runCiTokenCapabilityBackfill(tx, { reportOnly: false, expectedCount }),
        ),
      ).rejects.toThrow(BackfillCountMismatchError)

      expect(await ciTokensEnabledFor(owner.id)).toBe(false)
      expect(await getBackfillMarkerRowCount()).toBe(0)
    } finally {
      await deleteBackfillMarkerRow()
      expect(await getBackfillMarkerRowCount()).toBe(0)
    }
  }, 15000)

  it("(c) deactivateUsers holds ROW SHARE first (pre-UPDATE); the backfill queues for EXCLUSIVE without deadlocking deactivateUsers' commit; backfill then excludes the now-deactivated user and throws", async () => {
    const ambientIds = await getAmbientCohortIds()
    const { owner } = await seedCohortEligibleUser()
    seededUserIds.push(owner.id)
    const expectedCount = ambientIds.size + 1

    const barrier = createBarrier()
    const deactivatePromise = db.transaction((tx) => deactivateUsers(tx, [owner.id], barrier.hooks))
    await waitUntil(() => barrier.isReached())
    // deactivateUsers now holds ROW SHARE (table) + the row lock, parked
    // just before its UPDATE.

    let backfillResolved = false
    const backfillPromise = db
      .transaction((tx) => runCiTokenCapabilityBackfill(tx, { reportOnly: false, expectedCount }))
      .then((r) => {
        backfillResolved = true
        return r
      })

    try {
      await waitUntil(async () => (await countUserTableLocks('ExclusiveLock', false)) > 0, 5000)
      expect(backfillResolved).toBe(false)
    } finally {
      barrier.release()
    }

    // PostgreSQL promotes deactivateUsers' escalating same-session UPDATE
    // (ROW EXCLUSIVE) past the already-queued EXCLUSIVE waiter — it must
    // proceed and COMMIT here, not deadlock (40P01). A deadlocked commit
    // would reject this await instead of resolving with the updated row.
    const deactivateResult = await deactivatePromise
    expect(deactivateResult.users.map((u) => u.id)).toEqual([owner.id])

    try {
      await expect(backfillPromise).rejects.toThrow(BackfillCountMismatchError)
      expect(await ciTokensEnabledFor(owner.id)).toBe(false)
      expect(await getBackfillMarkerRowCount()).toBe(0)
    } finally {
      await deleteBackfillMarkerRow()
      expect(await getBackfillMarkerRowCount()).toBe(0)
    }
  }, 20000)
})
