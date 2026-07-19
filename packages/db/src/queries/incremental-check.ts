import type { IndexingRun, NewIndexingRun } from '../schema.js'

export type CheckTrigger = 'scheduled' | 'manual'

export type CheckDecision =
  | { action: 'skip_never_indexed' }
  | { action: 'skip_no_baseline' }
  | { action: 'skip_paused' }
  | { action: 'noop' }
  | { action: 'queue'; fromCommit: string; toCommit: string }

export function deriveIncrementalCheckDecision(input: {
  lastIndexedAt: Date | null
  enabled: boolean
  trigger: CheckTrigger
  remoteHead: string
  indexedCommitSha: string | null
}): CheckDecision {
  if (!input.lastIndexedAt) return { action: 'skip_never_indexed' }
  // Indexed before commit tracking (pre-0017): no baseline to diff against, and
  // the value cannot be backfilled. Never emit a failure — nudge a re-index.
  // Applies to manual checks too, since diffing is genuinely impossible.
  if (!input.indexedCommitSha) return { action: 'skip_no_baseline' }
  if (input.trigger === 'scheduled' && !input.enabled) return { action: 'skip_paused' }
  if (input.remoteHead === input.indexedCommitSha) return { action: 'noop' }
  return { action: 'queue', fromCommit: input.indexedCommitSha, toCommit: input.remoteHead }
}

/** Postgres unique-violation SQLSTATE, raised when the active-run index collides. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
}

export type PerformCheckDeps = {
  getActiveIncrementalRun: (branchId: string) => Promise<IndexingRun | null>
  resolveRemoteHead: (input: { branchName: string }) => Promise<string>
  createIndexingRun: (values: NewIndexingRun) => Promise<IndexingRun>
  updateIndexingRun: (id: string, values: Partial<NewIndexingRun>) => Promise<IndexingRun>
  enqueueIncremental: (input: {
    repositoryId: string
    branchId: string
    runId: string
    fromCommit: string
    toCommit: string
    trigger: CheckTrigger
  }) => Promise<{ queueName: string; jobId: string }>
}

export type PerformCheckInput = {
  repositoryId: string
  branchId: string
  branchName: string
  trigger: CheckTrigger
  lastIndexedAt: Date | null
  enabled: boolean
  indexedCommitSha: string | null
}

export type PerformCheckResult =
  | { outcome: 'skipped_never_indexed' }
  | { outcome: 'skipped_no_baseline' }
  | { outcome: 'skipped_paused' }
  | { outcome: 'reused'; run: IndexingRun }
  | { outcome: 'noop'; run: IndexingRun }
  | { outcome: 'queued'; run: IndexingRun }
  // Lost the active-run insert race AND the winner already finished before we
  // could re-fetch it — benign; callers treat it like a completed check.
  | { outcome: 'raced' }

/**
 * Shared scheduler + manual `check-now` orchestration. Pure of git/queue
 * concerns: callers inject `resolveRemoteHead` and `enqueueIncremental`.
 */
export async function performIncrementalCheck(
  deps: PerformCheckDeps,
  input: PerformCheckInput,
): Promise<PerformCheckResult> {
  // Cheap short-circuits that never resolve a remote head or write a run row.
  if (!input.lastIndexedAt) return { outcome: 'skipped_never_indexed' }
  if (!input.indexedCommitSha) return { outcome: 'skipped_no_baseline' }
  if (input.trigger === 'scheduled' && !input.enabled) return { outcome: 'skipped_paused' }

  const active = await deps.getActiveIncrementalRun(input.branchId)
  if (active) return { outcome: 'reused', run: active }

  const remoteHead = await deps.resolveRemoteHead({ branchName: input.branchName })

  // Create the run in `checking` first so concurrent checks collide on the
  // partial unique index. The loser catches the violation and reuses the winner.
  let run: IndexingRun
  try {
    run = await deps.createIndexingRun({
      repositoryId: input.repositoryId,
      branchId: input.branchId,
      kind: 'incremental',
      trigger: input.trigger,
      status: 'checking',
      fromCommit: input.indexedCommitSha,
      remoteHead,
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      const winner = await deps.getActiveIncrementalRun(input.branchId)
      if (winner) return { outcome: 'reused', run: winner }
      // The winner finished in the microseconds between our failed INSERT and
      // this re-fetch, so there is no active run to return. A check still ran —
      // never surface a 500 for a pure dedup collision.
      return { outcome: 'raced' }
    }
    throw error
  }

  const decision = deriveIncrementalCheckDecision({
    lastIndexedAt: input.lastIndexedAt,
    enabled: input.enabled,
    trigger: input.trigger,
    remoteHead,
    indexedCommitSha: input.indexedCommitSha,
  })

  if (decision.action === 'noop') {
    const updated = await deps.updateIndexingRun(run.id, {
      status: 'completed_noop',
      toCommit: remoteHead,
      changedFileCount: 0,
      deletedFileCount: 0,
      finishedAt: new Date(),
    })
    return { outcome: 'noop', run: updated }
  }

  // The skip_* decisions were already returned before the run was created, so
  // only `queue` remains. The guard narrows the union for TypeScript.
  if (decision.action !== 'queue') {
    throw new Error(`Unexpected incremental check decision: ${decision.action}`)
  }
  const { queueName, jobId } = await deps.enqueueIncremental({
    repositoryId: input.repositoryId,
    branchId: input.branchId,
    runId: run.id,
    fromCommit: decision.fromCommit,
    toCommit: decision.toCommit,
    trigger: input.trigger,
  })
  const updated = await deps.updateIndexingRun(run.id, {
    status: 'queued',
    toCommit: decision.toCommit,
    queueName,
    jobId,
  })
  return { outcome: 'queued', run: updated }
}
