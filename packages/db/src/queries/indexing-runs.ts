import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../client.js'
import { branches, indexingRuns, type NewIndexingRun } from '../schema.js'

export const ACTIVE_RUN_STATUSES = ['checking', 'queued', 'processing'] as const
export type ActiveRunStatus = (typeof ACTIVE_RUN_STATUSES)[number]
export type TerminalRunStatus = 'completed' | 'completed_noop' | 'failed' | 'skipped'

export type IncrementalSummaryStatus =
  | 'not_checked'
  | 'active'
  | 'fresh'
  | 'changes_indexed'
  | 'failed'
  | 'paused'
  | 'needs_reindex'

export type IncrementalIndexingSummary = {
  enabled: boolean
  status: IncrementalSummaryStatus
  lastCheckedAt: string | null
  nextCheckAt: string | null
  activeRun: {
    id: string
    jobId: string | null
    status: ActiveRunStatus
    startedAt: string | null
  } | null
  lastRun: {
    id: string
    status: TerminalRunStatus
    trigger: 'scheduled' | 'manual' | 'full_reindex'
    fromCommit: string | null
    toCommit: string | null
    changedFileCount: number
    deletedFileCount: number
    skippedFileCount: number
    chunkCount: number
    failureReason: string | null
    finishedAt: string | null
  } | null
}

const SCHEDULE_INTERVAL_HOURS = 6

export function getNextScheduledIncrementalCheck(now: Date): Date {
  const next = new Date(now)
  next.setUTCMinutes(0, 0, 0)
  const currentHour = now.getUTCHours()
  const nextBoundary =
    (Math.floor(currentHour / SCHEDULE_INTERVAL_HOURS) + 1) * SCHEDULE_INTERVAL_HOURS
  next.setUTCHours(nextBoundary)
  return next
}

export function deriveIncrementalSummaryStatus(input: {
  enabled: boolean
  pausedAt: Date | string | null
  activeRun: { status: ActiveRunStatus } | null
  lastRun: { status: TerminalRunStatus; changedFileCount: number } | null
  // Optional so callers that only care about run state keep working; required to
  // detect the pre-0017 "indexed but no baseline commit" case.
  lastIndexedAt?: Date | string | null
  indexedCommitSha?: string | null
}): IncrementalSummaryStatus {
  if (!input.enabled || input.pausedAt) return 'paused'
  if (input.activeRun) return 'active'
  // Indexed before commit tracking existed: incremental diffing is impossible
  // until a full re-index records a baseline commit.
  if (input.lastIndexedAt && !input.indexedCommitSha) return 'needs_reindex'
  if (!input.lastRun) return 'not_checked'
  switch (input.lastRun.status) {
    case 'completed':
      return input.lastRun.changedFileCount > 0 ? 'changes_indexed' : 'fresh'
    case 'completed_noop':
      return 'fresh'
    case 'failed':
      return 'failed'
    case 'skipped':
      return 'fresh'
  }
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

type BranchRow = {
  repositoryId: string
  incrementalIndexingEnabled: boolean
  incrementalPausedAt: Date | string | null
  lastIndexedAt?: Date | string | null
  indexedCommitSha?: string | null
}
type ActiveRunRow = {
  repositoryId: string
  id: string
  jobId: string | null
  status: ActiveRunStatus
  startedAt: Date | string | null
}
type LastRunRow = {
  repositoryId: string
  id: string
  status: TerminalRunStatus
  trigger: 'scheduled' | 'manual' | 'full_reindex'
  fromCommit: string | null
  toCommit: string | null
  changedFileCount: number
  deletedFileCount: number
  skippedFileCount: number
  chunkCount: number
  failureReason: string | null
  finishedAt: Date | string | null
}

export function buildIncrementalIndexingSummaries(
  repositoryIds: string[],
  rows: {
    branchRows: BranchRow[]
    activeRunRows: ActiveRunRow[]
    lastRunRows: LastRunRow[]
    now: Date
  },
): Map<string, IncrementalIndexingSummary> {
  const branchByRepo = new Map(rows.branchRows.map((r) => [r.repositoryId, r]))
  const activeByRepo = new Map(rows.activeRunRows.map((r) => [r.repositoryId, r]))
  const lastByRepo = new Map(rows.lastRunRows.map((r) => [r.repositoryId, r]))
  const summaries = new Map<string, IncrementalIndexingSummary>()

  for (const repositoryId of new Set(repositoryIds)) {
    const branch = branchByRepo.get(repositoryId)
    const enabled = branch?.incrementalIndexingEnabled ?? true
    const pausedAt = branch?.incrementalPausedAt ?? null
    const active = activeByRepo.get(repositoryId) ?? null
    const last = lastByRepo.get(repositoryId) ?? null
    const status = deriveIncrementalSummaryStatus({
      enabled,
      pausedAt,
      activeRun: active ? { status: active.status } : null,
      lastRun: last ? { status: last.status, changedFileCount: last.changedFileCount } : null,
      lastIndexedAt: branch?.lastIndexedAt ?? null,
      indexedCommitSha: branch?.indexedCommitSha ?? null,
    })
    // No upcoming check is meaningful when paused or when a re-index is required.
    const noNextCheck = !enabled || Boolean(pausedAt) || status === 'needs_reindex'
    summaries.set(repositoryId, {
      enabled,
      status,
      lastCheckedAt: toIso(last?.finishedAt ?? null),
      nextCheckAt: noNextCheck ? null : getNextScheduledIncrementalCheck(rows.now).toISOString(),
      activeRun: active
        ? {
            id: active.id,
            jobId: active.jobId,
            status: active.status,
            startedAt: toIso(active.startedAt),
          }
        : null,
      lastRun: last
        ? {
            id: last.id,
            status: last.status,
            trigger: last.trigger,
            fromCommit: last.fromCommit,
            toCommit: last.toCommit,
            changedFileCount: last.changedFileCount,
            deletedFileCount: last.deletedFileCount,
            skippedFileCount: last.skippedFileCount,
            chunkCount: last.chunkCount,
            failureReason: last.failureReason,
            finishedAt: toIso(last.finishedAt),
          }
        : null,
    })
  }
  return summaries
}

export async function createIndexingRun(values: NewIndexingRun) {
  const [run] = await db.insert(indexingRuns).values(values).returning()
  return run
}

// `Partial<NewIndexingRun>` (not a narrower Omit) so the dep signature in
// `performIncrementalCheck` is structurally assignable under strictFunctionTypes.
export async function updateIndexingRun(id: string, values: Partial<NewIndexingRun>) {
  const [run] = await db
    .update(indexingRuns)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(indexingRuns.id, id))
    .returning()
  return run
}

export async function getActiveIncrementalRun(branchId: string) {
  const [run] = await db
    .select()
    .from(indexingRuns)
    .where(
      and(
        eq(indexingRuns.branchId, branchId),
        eq(indexingRuns.kind, 'incremental'),
        inArray(indexingRuns.status, [...ACTIVE_RUN_STATUSES]),
      ),
    )
    .orderBy(desc(indexingRuns.createdAt))
    .limit(1)
  return run ?? null
}

export async function getIndexingRunById(id: string) {
  const [run] = await db.select().from(indexingRuns).where(eq(indexingRuns.id, id)).limit(1)
  return run ?? null
}

export async function listIndexingRuns(repositoryId: string, limit = 10) {
  return db
    .select()
    .from(indexingRuns)
    .where(eq(indexingRuns.repositoryId, repositoryId))
    .orderBy(desc(indexingRuns.createdAt))
    .limit(limit)
}

/**
 * Mark all active incremental runs for a branch as skipped because a full
 * re-index is taking over. Used by the re-index path; the worker stale-guard
 * relies on this status flip to abort branch advancement.
 */
export async function supersedeActiveIncrementalRuns(branchId: string, failureReason: string) {
  return db
    .update(indexingRuns)
    .set({
      status: 'skipped',
      failureCode: 'superseded_by_full_reindex',
      failureReason,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(indexingRuns.branchId, branchId),
        eq(indexingRuns.kind, 'incremental'),
        inArray(indexingRuns.status, [...ACTIVE_RUN_STATUSES]),
      ),
    )
    .returning({ id: indexingRuns.id })
}

// An incremental run should never legitimately stay active this long (the
// slowest part is the clone; even large repos finish in minutes). Anything
// older is orphaned — e.g. the worker crashed mid-run, leaving the BullMQ job
// gone but the row stuck active.
export const INCREMENTAL_RUN_MAX_AGE_MS = 30 * 60 * 1000

/**
 * Reap orphaned incremental runs: ones stuck in an active state
 * (`checking`/`queued`/`processing`) past the max-age threshold. Without this,
 * `getActiveIncrementalRun` keeps returning a dead run so `performIncrementalCheck`
 * returns `reused` forever and that repo's incremental indexing is wedged. Call
 * this at the start of each scheduler sweep (which also runs on worker boot).
 */
export async function reapStaleIncrementalRuns(maxAgeMs: number = INCREMENTAL_RUN_MAX_AGE_MS) {
  const now = new Date()
  return db
    .update(indexingRuns)
    .set({
      status: 'failed',
      failureCode: 'orphaned',
      failureReason:
        'Incremental run did not finish (the worker may have restarted). The next check will retry.',
      finishedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(indexingRuns.kind, 'incremental'),
        inArray(indexingRuns.status, [...ACTIVE_RUN_STATUSES]),
        // Cutoff computed by the DB clock: passing a JS Date param to compare
        // against a timestamp column isn't supported by the driver in a raw
        // `sql` fragment (it throws), and it would also be timezone-fragile.
        sql`coalesce(${indexingRuns.startedAt}, ${indexingRuns.createdAt}) < now() - ${maxAgeMs} * interval '1 millisecond'`,
      ),
    )
    .returning({ id: indexingRuns.id })
}

export async function pauseBranchIncrementalIndexing(branchId: string, userId: string) {
  const [branch] = await db
    .update(branches)
    .set({
      incrementalIndexingEnabled: false,
      incrementalPausedAt: new Date(),
      incrementalPausedBy: userId,
    })
    .where(eq(branches.id, branchId))
    .returning()
  return branch
}

export async function resumeBranchIncrementalIndexing(branchId: string) {
  const [branch] = await db
    .update(branches)
    .set({
      incrementalIndexingEnabled: true,
      incrementalPausedAt: null,
      incrementalPausedBy: null,
    })
    .where(eq(branches.id, branchId))
    .returning()
  return branch
}

export async function getIncrementalIndexingSummaries(
  repositoryIds: string[],
): Promise<Map<string, IncrementalIndexingSummary>> {
  const ids = [...new Set(repositoryIds)]
  if (ids.length === 0) return new Map()

  // Branch pause + baseline state. There is one default branch per repository
  // today; if multiple branches ever exist for a repo, an arbitrary row wins
  // (last write into the Map). Acceptable until multi-branch is supported.
  const branchRows = await db
    .select({
      repositoryId: branches.repositoryId,
      incrementalIndexingEnabled: branches.incrementalIndexingEnabled,
      incrementalPausedAt: branches.incrementalPausedAt,
      lastIndexedAt: branches.lastIndexedAt,
      indexedCommitSha: branches.indexedCommitSha,
    })
    .from(branches)
    .where(inArray(branches.repositoryId, ids))

  const activeRunRows = await db
    .select({
      repositoryId: indexingRuns.repositoryId,
      id: indexingRuns.id,
      jobId: indexingRuns.jobId,
      status: indexingRuns.status,
      startedAt: indexingRuns.startedAt,
      createdAt: indexingRuns.createdAt,
    })
    .from(indexingRuns)
    .where(
      and(
        inArray(indexingRuns.repositoryId, ids),
        eq(indexingRuns.kind, 'incremental'),
        inArray(indexingRuns.status, [...ACTIVE_RUN_STATUSES]),
      ),
    )
    .orderBy(desc(indexingRuns.createdAt))

  // Latest terminal run per repo (distinct on repository_id, newest first).
  const lastRunRows = await db
    .select({
      repositoryId: indexingRuns.repositoryId,
      id: indexingRuns.id,
      status: indexingRuns.status,
      trigger: indexingRuns.trigger,
      fromCommit: indexingRuns.fromCommit,
      toCommit: indexingRuns.toCommit,
      changedFileCount: indexingRuns.changedFileCount,
      deletedFileCount: indexingRuns.deletedFileCount,
      skippedFileCount: indexingRuns.skippedFileCount,
      chunkCount: indexingRuns.chunkCount,
      failureReason: indexingRuns.failureReason,
      finishedAt: indexingRuns.finishedAt,
      createdAt: indexingRuns.createdAt,
    })
    .from(indexingRuns)
    .where(
      and(
        inArray(indexingRuns.repositoryId, ids),
        eq(indexingRuns.kind, 'incremental'),
        sql`${indexingRuns.status} NOT IN ('checking', 'queued', 'processing')`,
      ),
    )
    .orderBy(desc(indexingRuns.createdAt))

  // Keep only the newest active / terminal row per repository (rows are already
  // newest-first, so the first one wins).
  const keepFirstPerRepository = <T extends { repositoryId: string }>(rows: T[]): T[] => {
    const seen = new Set<string>()
    const result: T[] = []
    for (const row of rows) {
      if (seen.has(row.repositoryId)) continue
      seen.add(row.repositoryId)
      result.push(row)
    }
    return result
  }
  const firstActive = keepFirstPerRepository(activeRunRows)
  const firstLast = keepFirstPerRepository(lastRunRows)

  // The WHERE clauses constrain `status` to the active / terminal subsets, but
  // the column type stays the full union — cast to the narrowed row shapes.
  return buildIncrementalIndexingSummaries(ids, {
    branchRows,
    activeRunRows: firstActive as ActiveRunRow[],
    lastRunRows: firstLast as LastRunRow[],
    now: new Date(),
  })
}
