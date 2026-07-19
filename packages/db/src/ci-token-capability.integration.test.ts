import { and, eq, inArray, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BackfillCountMismatchError,
  buildCohortSelect,
  runCiTokenCapabilityBackfill,
} from './backfill-ci-token-capability.js'
import { closeDbConnection, db } from './client.js'
import { mcpTokens, repositories, user } from './schema.js'

// Real-Postgres integration suite for migration 0024 + its backfill. Connects
// to the SHARED local dev database via DATABASE_URL — e.g. locally:
//   export DATABASE_URL=$(grep '^DATABASE_URL=' apps/api/.env | cut -d= -f2-)
// There is real data in here, so every seed is tagged with the `it-15a-`
// prefix and torn down by exact id in each test's finally block. NEVER
// truncate a shared table wholesale.
//
// Mirrors the private marker filename inside backfill-ci-token-capability.ts.
// Not exported from there on purpose (it's an implementation constant); the
// module's own unit test pins the literal string, so drift would be caught
// there first.
const BACKFILL_MARKER_FILENAME = '0024_ci_token_capability_backfill'

const EMAIL_DOMAIN = 'integration.test'
const EMAIL_PREFIX = 'it-15a-'

const MIGRATION_0024_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../migrations/0024_ci_token_capability.sql',
)

// ─── Seed helpers ───────────────────────────────────────────────────────────

function uniqueSuffix() {
  return randomUUID()
}

type UserOverrides = Partial<typeof user.$inferInsert>
type RepositoryOverrides = Partial<typeof repositories.$inferInsert>
type TokenOverrides = Partial<typeof mcpTokens.$inferInsert>

async function seedUser(overrides: UserOverrides = {}) {
  const now = new Date()
  const [row] = await db
    .insert(user)
    .values({
      id: `${EMAIL_PREFIX}user-${uniqueSuffix()}`,
      name: 'IT-15A Test User',
      email: `${EMAIL_PREFIX}${uniqueSuffix()}@${EMAIL_DOMAIN}`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      role: 'user',
      ciTokensEnabled: false,
      ...overrides,
    })
    .returning()
  if (!row) throw new Error('seedUser: insert returned no row')
  return row
}

async function seedRepository(ownerId: string, overrides: RepositoryOverrides = {}) {
  const [row] = await db
    .insert(repositories)
    .values({
      userId: ownerId,
      name: `${EMAIL_PREFIX}repo-${uniqueSuffix()}`,
      cloneUrl: `https://example.invalid/${EMAIL_PREFIX}${uniqueSuffix()}.git`,
      provider: 'github',
      ...overrides,
    })
    .returning()
  if (!row) throw new Error('seedRepository: insert returned no row')
  return row
}

async function seedToken(ownerId: string, overrides: TokenOverrides = {}) {
  const [row] = await db
    .insert(mcpTokens)
    .values({
      userId: ownerId,
      tokenHash: `${EMAIL_PREFIX}hash-${uniqueSuffix()}`,
      fingerprint: `${EMAIL_PREFIX}fp-${uniqueSuffix()}`,
      label: 'it-15a token',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      ...overrides,
    })
    .returning()
  if (!row) throw new Error('seedToken: insert returned no row')
  return row
}

/** Deletes seeded top-level users; FK cascades remove their repositories and tokens. */
async function deleteSeededUsers(ids: string[]) {
  if (ids.length === 0) return
  await db.delete(user).where(inArray(user.id, ids))
}

async function resetCiTokensEnabledFlag(ids: string[]) {
  if (ids.length === 0) return
  await db.update(user).set({ ciTokensEnabled: false }).where(inArray(user.id, ids))
}

// Snapshot BEFORE an armed run: cleanup must RESTORE, not force-false — an
// ambient dev-DB user who already had the flag on legitimately (it's in real
// use once the feature ships) must not be disabled by our cleanup.
async function getFlagOnUserIds(): Promise<Set<string>> {
  const rows = await db.select({ id: user.id }).from(user).where(eq(user.ciTokensEnabled, true))
  return new Set(rows.map((row) => row.id))
}

async function getMarkerRowCount() {
  const rows = (await db.execute(
    sql`SELECT 1 FROM "manual_migrations" WHERE "filename" = ${BACKFILL_MARKER_FILENAME}`,
  )) as unknown as unknown[]
  return rows.length
}

async function deleteMarkerRow() {
  await db.execute(
    sql`DELETE FROM "manual_migrations" WHERE "filename" = ${BACKFILL_MARKER_FILENAME}`,
  )
}

/**
 * Cohort membership depends on live `user`/`mcp_tokens` rows outside our
 * control (this is the shared local dev DB). Snapshotting the ambient cohort
 * before seeding — and asserting against `ambient + seeded` rather than a
 * hardcoded literal — keeps these tests correct regardless of what else is in
 * the database, while still failing loudly on a real regression.
 */
async function getAmbientCohortIds() {
  const rows = await buildCohortSelect(db)
  return new Set(rows.map((row) => row.id))
}

async function waitUntil(predicate: () => boolean, timeoutMs = 5000, intervalMs = 20) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitUntil: timed out waiting for condition')
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

async function applyMigration0024() {
  const content = readFileSync(MIGRATION_0024_PATH, 'utf8')
  const statements = content
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
  for (const statement of statements) {
    await db.execute(sql.raw(statement))
  }
}

describe('ci-token-capability integration (real Postgres)', () => {
  // Belt-and-suspenders: if a previous run of this suite crashed mid-test and
  // left seeds behind, purge them before we start rather than let them skew
  // ambient cohort counts. Per-test try/finally blocks are the primary
  // cleanup mechanism; this is just a safety net.
  beforeAll(async () => {
    const leftoverUsers = (await db.execute(
      sql`SELECT id FROM "user" WHERE email LIKE ${`${EMAIL_PREFIX}%@${EMAIL_DOMAIN}`}`,
    )) as unknown as { id: string }[]
    if (leftoverUsers.length > 0) {
      console.warn(
        `ci-token-capability.integration.test: purging ${leftoverUsers.length} leftover seed(s) from a previous run`,
      )
      await deleteSeededUsers(leftoverUsers.map((row) => row.id))
    }
    await deleteMarkerRow()
  })

  afterAll(async () => {
    await closeDbConnection()
  })

  describe('migration 0024 idempotency', () => {
    it('applies twice with no error; the capability column exists exactly once', async () => {
      await applyMigration0024()
      await applyMigration0024()

      const columns = (await db.execute(sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'user' AND column_name = 'ci_tokens_enabled'
      `)) as unknown as unknown[]
      expect(columns.length).toBe(1)
    })

    it('un-revokes admin_token_migration rows on first apply; second apply changes nothing', async () => {
      const owner = await seedUser()
      const seededUserIds = [owner.id]
      try {
        const repo = await seedRepository(owner.id)
        const token = await seedToken(owner.id, {
          repositoryId: repo.id,
          revokedAt: new Date('2026-01-01T00:00:00Z'),
          revokedReason: 'admin_token_migration',
        })

        await applyMigration0024()

        const [afterFirstApply] = await db
          .select()
          .from(mcpTokens)
          .where(eq(mcpTokens.id, token.id))
        expect(afterFirstApply).toBeDefined()
        expect(afterFirstApply?.revokedAt).toBeNull()
        expect(afterFirstApply?.revokedReason).toBeNull()

        await applyMigration0024()

        const [afterSecondApply] = await db
          .select()
          .from(mcpTokens)
          .where(eq(mcpTokens.id, token.id))
        // No row still matches revoked_reason = 'admin_token_migration', so the
        // second apply's UPDATE affects zero rows — the entire row, including
        // every other column and timestamp, must be byte-identical.
        expect(afterSecondApply).toEqual(afterFirstApply)
      } finally {
        await deleteSeededUsers(seededUserIds)
      }
    })
  })

  describe('runCiTokenCapabilityBackfill', () => {
    it('holds an EXCLUSIVE lock on "user" for the duration of the backfill', async () => {
      let lockRows: unknown[] = []
      await db.transaction((tx) =>
        runCiTokenCapabilityBackfill(
          tx,
          { reportOnly: true, expectedCount: 0 },
          {
            afterLock: async () => {
              // Query through the GLOBAL pool, not `tx` — a different
              // session, so this observes the lock rather than trivially
              // seeing the holder's own locks.
              lockRows = (await db.execute(sql`
                  SELECT 1 FROM pg_locks
                  WHERE relation = '"user"'::regclass AND locktype = 'relation'
                    AND mode = 'ExclusiveLock' AND granted
                `)) as unknown as unknown[]
            },
          },
        ),
      )
      expect(lockRows.length).toBeGreaterThan(0)
    }, 15000)

    it("returns 'noop' and writes nothing when the marker row already exists", async () => {
      await db.execute(
        sql`INSERT INTO "manual_migrations" ("filename") VALUES (${BACKFILL_MARKER_FILENAME})`,
      )
      try {
        const result = await db.transaction((tx) =>
          runCiTokenCapabilityBackfill(tx, { reportOnly: false, expectedCount: 0 }),
        )
        expect(result.outcome).toBe('noop')
        expect(result.cohort).toEqual([])
      } finally {
        await deleteMarkerRow()
      }
    })

    it('report-only mode reports the cohort but writes no flag and no marker', async () => {
      const ambientIds = await getAmbientCohortIds()
      const owner = await seedUser()
      const seededUserIds = [owner.id]
      try {
        const repo = await seedRepository(owner.id)
        await seedToken(owner.id, { repositoryId: repo.id, lastUsedAt: new Date() })

        const result = await db.transaction((tx) =>
          runCiTokenCapabilityBackfill(tx, { reportOnly: true, expectedCount: 0 }),
        )

        expect(result.outcome).toBe('reported')
        expect(result.cohort).toHaveLength(ambientIds.size + 1)
        expect(result.cohort.some((row) => row.id === owner.id)).toBe(true)

        const [refreshed] = await db.select().from(user).where(eq(user.id, owner.id))
        expect(refreshed?.ciTokensEnabled).toBe(false)
        expect(await getMarkerRowCount()).toBe(0)
      } finally {
        await deleteSeededUsers(seededUserIds)
      }
    })

    it('throws BackfillCountMismatchError on a count mismatch and rolls back', async () => {
      const owner = await seedUser()
      const seededUserIds = [owner.id]
      try {
        const repo = await seedRepository(owner.id)
        await seedToken(owner.id, { repositoryId: repo.id, lastUsedAt: new Date() })

        await expect(
          db.transaction((tx) =>
            runCiTokenCapabilityBackfill(tx, { reportOnly: false, expectedCount: 999 }),
          ),
        ).rejects.toThrow(BackfillCountMismatchError)

        const [refreshed] = await db.select().from(user).where(eq(user.id, owner.id))
        expect(refreshed?.ciTokensEnabled).toBe(false)
        expect(await getMarkerRowCount()).toBe(0)
      } finally {
        await deleteSeededUsers(seededUserIds)
      }
    })

    it('grants the capability, sets the flag, and inserts the marker row', async () => {
      const ambientIds = await getAmbientCohortIds()
      const flagOnBefore = await getFlagOnUserIds()
      const owner = await seedUser()
      const seededUserIds = [owner.id]
      let grantedIds: string[] = []
      try {
        const repo = await seedRepository(owner.id)
        await seedToken(owner.id, { repositoryId: repo.id, lastUsedAt: new Date() })

        const expectedCount = ambientIds.size + 1
        const result = await db.transaction((tx) =>
          runCiTokenCapabilityBackfill(tx, { reportOnly: false, expectedCount }),
        )
        // Capture what actually got granted BEFORE any assertion can throw,
        // so the finally block cleans up correctly either way.
        grantedIds = result.cohort.map((row) => row.id)

        expect(result.outcome).toBe('granted')
        expect(grantedIds).toContain(owner.id)

        const [refreshed] = await db.select().from(user).where(eq(user.id, owner.id))
        expect(refreshed?.ciTokensEnabled).toBe(true)
        expect(await getMarkerRowCount()).toBe(1)
      } finally {
        // Restore, don't force-false: reset only granted ids that were NOT
        // already flag-on before we armed the run — an ambient dev-DB user
        // with the flag legitimately enabled must keep it.
        await resetCiTokensEnabledFlag(grantedIds.filter((id) => !flagOnBefore.has(id)))
        await deleteMarkerRow()
        await deleteSeededUsers(seededUserIds)

        // The marker MUST NOT persist in the local dev DB — verify cleanup.
        expect(await getMarkerRowCount()).toBe(0)
        if (grantedIds.length > 0) {
          // Use the query builder's inArray, not a raw `ANY(${array})` SQL
          // template — postgres.js does not serialize a plain JS array
          // interpolated into a `sql` template as a Postgres array literal.
          const stillEnabled = await db
            .select({ id: user.id })
            .from(user)
            .where(and(inArray(user.id, grantedIds), eq(user.ciTokensEnabled, true)))
          expect(stillEnabled.length).toBe(0)
        }
      }
    })

    it('under concurrent invocations, exactly one grants and the other no-ops', async () => {
      const ambientIds = await getAmbientCohortIds()
      const flagOnBefore = await getFlagOnUserIds()
      const owner = await seedUser()
      const seededUserIds = [owner.id]
      let grantedIds: string[] = []
      try {
        const repo = await seedRepository(owner.id)
        await seedToken(owner.id, { repositoryId: repo.id, lastUsedAt: new Date() })
        const expectedCount = ambientIds.size + 1

        let aReachedLock = false
        let releaseA!: () => void
        const aCanProceed = new Promise<void>((resolve) => {
          releaseA = resolve
        })

        const runA = db.transaction((tx) =>
          runCiTokenCapabilityBackfill(
            tx,
            { reportOnly: false, expectedCount },
            {
              afterLock: async () => {
                aReachedLock = true
                await aCanProceed
              },
            },
          ),
        )

        // Don't start B until A is confirmed to be holding the lock.
        await waitUntil(() => aReachedLock, 5000)

        let bResolved = false
        const runB = db
          .transaction((tx) =>
            runCiTokenCapabilityBackfill(tx, { reportOnly: false, expectedCount }),
          )
          .then((result) => {
            bResolved = true
            return result
          })

        // B must be blocked behind A's EXCLUSIVE lock — give it a beat and
        // confirm it has NOT resolved. `releaseA` MUST fire even if this
        // assertion throws — otherwise A's transaction hangs forever
        // holding the EXCLUSIVE lock on the shared "user" table, wedging
        // every other test (and every other developer's dev DB session).
        try {
          await new Promise((resolve) => setTimeout(resolve, 300))
          expect(bResolved).toBe(false)
        } finally {
          releaseA()
        }
        const resultA = await runA
        const resultB = await runB

        grantedIds = resultA.cohort.map((row) => row.id)

        expect(resultA.outcome).toBe('granted')
        expect(resultB.outcome).toBe('noop')
        expect(resultB.cohort).toEqual([])

        const [refreshed] = await db.select().from(user).where(eq(user.id, owner.id))
        expect(refreshed?.ciTokensEnabled).toBe(true)
      } finally {
        // Restore, don't force-false (see getFlagOnUserIds).
        await resetCiTokensEnabledFlag(grantedIds.filter((id) => !flagOnBefore.has(id)))
        await deleteMarkerRow()
        await deleteSeededUsers(seededUserIds)

        expect(await getMarkerRowCount()).toBe(0)
      }
    }, 15000)

    it('rolls back the grant and marker if beforeCommit throws', async () => {
      const ambientIds = await getAmbientCohortIds()
      const owner = await seedUser()
      const seededUserIds = [owner.id]
      try {
        const repo = await seedRepository(owner.id)
        await seedToken(owner.id, { repositoryId: repo.id, lastUsedAt: new Date() })
        const expectedCount = ambientIds.size + 1

        await expect(
          db.transaction((tx) =>
            runCiTokenCapabilityBackfill(
              tx,
              { reportOnly: false, expectedCount },
              {
                beforeCommit: async () => {
                  throw new Error('simulated beforeCommit failure')
                },
              },
            ),
          ),
        ).rejects.toThrow('simulated beforeCommit failure')

        const [refreshed] = await db.select().from(user).where(eq(user.id, owner.id))
        expect(refreshed?.ciTokensEnabled).toBe(false)
        expect(await getMarkerRowCount()).toBe(0)
      } finally {
        await deleteSeededUsers(seededUserIds)
      }
    })

    it('cohort predicate: includes/excludes users correctly on every axis', async () => {
      const now = new Date()
      const recentUsed = new Date(now.getTime() - 1000 * 60 * 60) // 1 hour ago
      const staleUsed = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 40) // 40 days ago

      const seededUserIds: string[] = []
      try {
        const deactivatedOwner = await seedUser({ deactivatedAt: now })
        seededUserIds.push(deactivatedOwner.id)
        const repoForDeactivated = await seedRepository(deactivatedOwner.id)
        await seedToken(deactivatedOwner.id, {
          repositoryId: repoForDeactivated.id,
          lastUsedAt: recentUsed,
        })

        const userLevelOwner = await seedUser()
        seededUserIds.push(userLevelOwner.id)
        await seedToken(userLevelOwner.id, { repositoryId: null, lastUsedAt: recentUsed })

        const staleOwner = await seedUser()
        seededUserIds.push(staleOwner.id)
        const repoForStale = await seedRepository(staleOwner.id)
        await seedToken(staleOwner.id, { repositoryId: repoForStale.id, lastUsedAt: staleUsed })

        const otherRevokedOwner = await seedUser()
        seededUserIds.push(otherRevokedOwner.id)
        const repoForOtherRevoked = await seedRepository(otherRevokedOwner.id)
        await seedToken(otherRevokedOwner.id, {
          repositoryId: repoForOtherRevoked.id,
          lastUsedAt: recentUsed,
          revokedAt: now,
          revokedReason: 'some_other_reason',
        })

        const migrationRevokedOwner = await seedUser()
        seededUserIds.push(migrationRevokedOwner.id)
        const repoForMigrationRevoked = await seedRepository(migrationRevokedOwner.id)
        await seedToken(migrationRevokedOwner.id, {
          repositoryId: repoForMigrationRevoked.id,
          lastUsedAt: recentUsed,
          revokedAt: now,
          revokedReason: 'admin_token_migration',
        })

        const activeOwner = await seedUser()
        seededUserIds.push(activeOwner.id)
        const repoForActive = await seedRepository(activeOwner.id)
        await seedToken(activeOwner.id, { repositoryId: repoForActive.id, lastUsedAt: recentUsed })

        const result = await db.transaction((tx) =>
          runCiTokenCapabilityBackfill(tx, { reportOnly: true, expectedCount: 0 }),
        )
        expect(result.outcome).toBe('reported')

        const cohortIds = new Set(result.cohort.map((row) => row.id))

        expect(cohortIds.has(deactivatedOwner.id)).toBe(false)
        expect(cohortIds.has(userLevelOwner.id)).toBe(false)
        expect(cohortIds.has(staleOwner.id)).toBe(false)
        expect(cohortIds.has(otherRevokedOwner.id)).toBe(false)
        expect(cohortIds.has(migrationRevokedOwner.id)).toBe(true)
        expect(cohortIds.has(activeOwner.id)).toBe(true)
      } finally {
        await deleteSeededUsers(seededUserIds)
      }
    })
  })
})
