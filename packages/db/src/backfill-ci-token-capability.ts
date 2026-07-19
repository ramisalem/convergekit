import { inArray, sql } from 'drizzle-orm'
import { pathToFileURL } from 'node:url'
import { closeDbConnection, db } from './client.js'
import { user } from './schema.js'

// One-time production rollout command: grants `user.ci_tokens_enabled = true` to
// the audited cohort of recently-active per-repo CI token owners. See spec
// "Backfill Cohort & Blast Radius" in
// docs/superpowers/specs/2026-07-12-ci-tokens-per-user-capability-design.md.
//
// Deliberately NOT part of migration 0024: the capability grant needs a
// per-environment expected-count check (prod: exactly 15, or abort for a fresh
// human re-audit; non-prod: report-only) that a migration — which must run
// identically everywhere — cannot express. Splitting it out keeps 0024
// environment-agnostic and makes the count check and the grant one
// transactionally-consistent operation instead of two.
//
// `runCiTokenCapabilityBackfill`'s outcome union is deliberately
// `'granted' | 'reported' | 'noop'` — there is no `'aborted'` member. A count
// mismatch instead THROWS `BackfillCountMismatchError`, so the caller's
// transaction rolls back by construction (drizzle's `db.transaction` rolls back
// and re-throws when its callback throws — the same mechanism
// apps/api/src/lib/ci-token-service.ts already relies on for its own 404s). A
// returned `{ outcome: 'aborted' }` would be a value a caller could inspect and
// choose to commit past anyway; throwing removes that option entirely.

// Deliberately DERIVED from the live `db` instance rather than importing
// drizzle's transaction type with hand-pinned generics (see the sibling
// definition at apps/api/src/lib/db-executor.ts) — the derived form can never
// drift from this client's actual configuration. Redefined locally because
// packages must not import from apps.
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Test-only await points so an integration suite can assert lock-hold timing. */
type BackfillHooks = {
  afterLock?: () => Promise<void>
  beforeCommit?: () => Promise<void>
}

export type CohortRow = { id: string; email: string; role: string }

// Deliberately does NOT collide with the real migration file
// `0024_ci_token_capability.sql` tracked by apply-manual-migrations.ts — this
// marker tracks the one-time *backfill*, not the schema migration.
const BACKFILL_MARKER_FILENAME = '0024_ci_token_capability_backfill'

export class BackfillCountMismatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackfillCountMismatchError'
  }
}

/**
 * DISTINCT id/email/role of every user who: is not deactivated, owns at least
 * one per-repo (`repository_id IS NOT NULL`) mcp_tokens row used in the last 30
 * days, and that row is not revoked (or was only revoked by the since-reverted
 * 0023 migration, marked `admin_token_migration`).
 */
export async function buildCohortSelect(executor: Executor): Promise<CohortRow[]> {
  const rows = (await executor.execute(sql`
    SELECT DISTINCT u.id, u.email, u.role
    FROM "user" u
    JOIN mcp_tokens t ON t.user_id = u.id
    WHERE u.deactivated_at IS NULL
      AND t.repository_id IS NOT NULL
      AND t.last_used_at > now() - interval '30 days'
      AND (t.revoked_at IS NULL OR t.revoked_reason = 'admin_token_migration')
    ORDER BY u.email
  `)) as unknown as CohortRow[]
  return rows
}

/**
 * Pure decision table for what to do with a selected cohort: report-only always
 * wins (never writes); otherwise an exact-count match grants, anything else
 * aborts (a fresh human re-audit, not a tolerance band).
 */
export function decideGrant({
  count,
  expectedCount,
  reportOnly,
}: {
  count: number
  expectedCount: number
  reportOnly: boolean
}): 'report' | 'abort' | 'grant' {
  if (reportOnly) return 'report'
  if (count !== expectedCount) return 'abort'
  return 'grant'
}

/**
 * The whole sequence runs on the PASSED executor — the caller owns the
 * transaction (see `main` below, which opens one via `db.transaction`). Ordering
 * is exact and load-bearing; see spec "Backfill Cohort & Blast Radius".
 */
export async function runCiTokenCapabilityBackfill(
  executor: Executor,
  opts: { reportOnly: boolean; expectedCount: number; logger?: (m: string) => void },
  hooks?: BackfillHooks,
): Promise<{ outcome: 'granted' | 'reported' | 'noop'; cohort: CohortRow[] }> {
  const log = opts.logger ?? console.log

  // 1. Table-level lock, taken as the very first statement (PostgreSQL's
  // explicit-locking guidance: take the most restrictive lock first).
  //
  // EXCLUSIVE, not SHARE ROW EXCLUSIVE: every v2 mutation (create/renew/
  // deactivate/bulk-deactivate/capability-disable/revoke-all) enters via
  // `SELECT ... FOR UPDATE`, whose table-level lock is ROW SHARE. SHARE ROW
  // EXCLUSIVE is compatible with ROW SHARE, so under SRE an in-flight mutation
  // would already hold its row lock, then queue at its own subsequent `UPDATE`
  // (ROW EXCLUSIVE, which SRE does not admit) while this backfill's grant
  // `UPDATE` queues behind that same row lock — a lock-order cycle (deadlock,
  // one side aborted). EXCLUSIVE additionally conflicts with ROW SHARE, so both
  // entry patterns — the old app's plain `UPDATE` (ROW EXCLUSIVE) and the new
  // app's `SELECT ... FOR UPDATE` (ROW SHARE) — wait at the gate holding
  // nothing, while plain reads (ACCESS SHARE — session auth) still proceed.
  //
  // Plain BLOCKING acquisition, no retry loop: PostgreSQL's wait-queue
  // insertion rule admits a lock request from a transaction that already holds
  // a lock conflicting with an earlier, still-queued waiter's request AHEAD of
  // that waiter (the waiter could never be granted while the holder's lock
  // exists — waiting behind it would be an instant false deadlock). So an
  // in-flight mutation always completes and commits first, and this backfill's
  // cohort select then sees that committed effect. A bounded-backoff retry
  // acquisition was considered and rejected: it would add an exhaustion failure
  // mode to guard against a cycle the lock manager already prevents by
  // construction. Verified empirically on pgvector/pgvector:pg16.
  await executor.execute(sql`LOCK TABLE "user" IN EXCLUSIVE MODE`)

  // 2. Test-only await point, after lock acquisition, before any read/write.
  await hooks?.afterLock?.()

  // 3. Authoritative marker re-check, now that the lock is held. This is what
  // makes concurrent invocations safe: a second, overlapping invocation blocks
  // on the lock above, then — once granted — finds the marker here and cleanly
  // no-ops, never attempting the grant UPDATE or the marker INSERT below.
  const markerRows = (await executor.execute(sql`
    SELECT 1 FROM "manual_migrations" WHERE "filename" = ${BACKFILL_MARKER_FILENAME}
  `)) as unknown as unknown[]
  if (markerRows.length > 0) {
    log('CI token capability backfill already applied — no-op')
    return { outcome: 'noop', cohort: [] }
  }

  // 4. Cohort select.
  const cohort = await buildCohortSelect(executor)

  // 5. Log every cohort row — the deploy log is the audit record of who was
  // granted the capability.
  for (const row of cohort) {
    log(`CI token capability backfill cohort: id=${row.id} email=${row.email} role=${row.role}`)
  }

  // 6. Decide.
  const decision = decideGrant({
    count: cohort.length,
    expectedCount: opts.expectedCount,
    reportOnly: opts.reportOnly,
  })

  if (decision === 'report') {
    return { outcome: 'reported', cohort }
  }

  if (decision === 'abort') {
    log(
      `CI token capability backfill count mismatch: found ${cohort.length}, expected ${opts.expectedCount}`,
    )
    throw new BackfillCountMismatchError(
      `CI token capability backfill cohort count mismatch: found ${cohort.length}, expected ${opts.expectedCount}`,
    )
  }

  // 7. Grant.
  const ids = cohort.map((row) => row.id)
  const updated =
    ids.length === 0
      ? []
      : await executor
          .update(user)
          .set({ ciTokensEnabled: true })
          .where(inArray(user.id, ids))
          .returning({ id: user.id })

  if (updated.length !== cohort.length) {
    throw new Error(
      `CI token capability backfill grant affected ${updated.length} rows, expected ${cohort.length}`,
    )
  }

  // 8. Marker insert — same transaction as the grant.
  await executor.execute(sql`
    INSERT INTO "manual_migrations" ("filename") VALUES (${BACKFILL_MARKER_FILENAME})
  `)

  // 9. Test-only await point, after all writes, before COMMIT.
  await hooks?.beforeCommit?.()

  // 10. Report success.
  return { outcome: 'granted', cohort }
}

/**
 * Exported for tests (like decideGrant): resolves the arming policy from CLI
 * args (`--report-only`, `--expected-count=N`) with env fallbacks
 * (`CI_TOKEN_BACKFILL_REPORT_ONLY`, `CI_TOKEN_BACKFILL_EXPECTED_COUNT` — how
 * the deploy Job passes them); CLI wins over env if both are set. `source` is
 * coarse provenance for the deploy log: 'cli' if any CLI flag was passed, else
 * 'env' if any env var was set, else 'default'.
 */
export function resolveBackfillOptions(
  argv: string[],
  env: NodeJS.ProcessEnv,
): { reportOnly: boolean; expectedCount: number; source: 'cli' | 'env' | 'default' } {
  let cliReportOnly: boolean | undefined
  let cliExpectedCountRaw: string | undefined

  for (const arg of argv) {
    if (arg === '--report-only' || arg === '--report-only=true') {
      cliReportOnly = true
    } else if (arg === '--report-only=false') {
      cliReportOnly = false
    } else if (arg.startsWith('--expected-count=')) {
      cliExpectedCountRaw = arg.slice('--expected-count='.length)
    }
  }

  // Only the exact string 'false' reads as false — 'False', 'no', '' and
  // anything else all read as true (the safe, report-only direction).
  const envReportOnly =
    env.CI_TOKEN_BACKFILL_REPORT_ONLY === undefined
      ? undefined
      : env.CI_TOKEN_BACKFILL_REPORT_ONLY !== 'false'

  const reportOnlyFlag = cliReportOnly ?? envReportOnly
  const expectedCountRaw = cliExpectedCountRaw ?? env.CI_TOKEN_BACKFILL_EXPECTED_COUNT

  const source: 'cli' | 'env' | 'default' =
    cliReportOnly !== undefined || cliExpectedCountRaw !== undefined
      ? 'cli'
      : envReportOnly !== undefined || env.CI_TOKEN_BACKFILL_EXPECTED_COUNT !== undefined
        ? 'env'
        : 'default'

  // Default is report-only unless report-only is explicitly false AND an
  // expected count was actually provided — an operator can't trigger a real
  // grant attempt by only half-specifying the policy.
  if (reportOnlyFlag === false && expectedCountRaw !== undefined) {
    // Arming: the count must parse as an integer NOW, at parse time — a typo'd
    // or empty value fails here with a clear error instead of running the whole
    // cohort query and aborting on NaN. The empty-string check is load-bearing:
    // Number('') is 0, so '' would otherwise silently arm with an expected
    // count of zero.
    const expectedCount = Number(expectedCountRaw)
    if (expectedCountRaw.trim() === '' || !Number.isInteger(expectedCount)) {
      throw new Error(
        `Cannot arm CI token capability backfill: expected count must be an integer, got ${JSON.stringify(expectedCountRaw)}`,
      )
    }
    return { reportOnly: false, expectedCount, source }
  }

  // Report-only: the count is never compared (decideGrant short-circuits), so a
  // missing or malformed value just echoes as 0.
  const parsed =
    expectedCountRaw === undefined || expectedCountRaw.trim() === ''
      ? undefined
      : Number(expectedCountRaw)
  return {
    reportOnly: true,
    expectedCount: parsed !== undefined && Number.isInteger(parsed) ? parsed : 0,
    source,
  }
}

async function main() {
  const { reportOnly, expectedCount, source } = resolveBackfillOptions(
    process.argv.slice(2),
    process.env,
  )
  console.log(
    `CI token capability backfill options: reportOnly=${reportOnly} expectedCount=${expectedCount} source=${source}`,
  )

  // 0. Cheap pre-transaction fast-path (spec step 0): once the marker exists,
  // every later deploy skips here WITHOUT opening a transaction or queueing on
  // the EXCLUSIVE lock — otherwise each deploy would park behind any
  // long-lived user-table transaction (no lock_timeout), stalling new user
  // writes while it waits. NOT authoritative: only the marker re-check under
  // the lock inside runCiTokenCapabilityBackfill can decide safely against a
  // concurrent invocation; this is just the already-applied early-out.
  const applied = (await db.execute(sql`
    SELECT 1 FROM "manual_migrations" WHERE "filename" = ${BACKFILL_MARKER_FILENAME}
  `)) as unknown as unknown[]
  if (applied.length > 0) {
    console.log('CI token capability backfill already applied — skipping (fast-path)')
    return
  }

  const result = await db.transaction((tx) =>
    runCiTokenCapabilityBackfill(tx, { reportOnly, expectedCount }),
  )

  console.log(
    `CI token capability backfill: outcome=${result.outcome} cohortSize=${result.cohort.length} reportOnly=${reportOnly} expectedCount=${expectedCount}`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
    .finally(async () => {
      // A close hiccup after a successful commit must not fail the deploy Job.
      await closeDbConnection().catch((error) => console.error('connection close failed', error))
    })
}
