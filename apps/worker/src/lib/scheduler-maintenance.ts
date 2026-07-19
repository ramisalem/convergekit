/**
 * Repeatable-scheduler hygiene for the incremental-update queue.
 *
 * The current design drives all incremental work from a single repeatable
 * `scheduler-tick`. Earlier designs registered one repeatable `sync` job per
 * repository with `fromCommit: 'HEAD~1'`. BullMQ persists repeatable schedulers
 * in Redis, so those orphans survive deploys: they keep firing every cycle,
 * clone, attempt `git diff HEAD~1 HEAD`, and fail forever. Nothing in the new
 * design removes them.
 *
 * `pruneObsoleteSchedulers` removes every scheduler on the queue except the
 * canonical tick. It is pure (no queue/Redis imports) so it can be unit-tested
 * in isolation; callers inject `listSchedulers` / `removeScheduler` backed by
 * the real BullMQ queue.
 */

export interface JobSchedulerSummary {
  key: string
  name: string
}

export interface PruneSchedulersDeps {
  listSchedulers: () => Promise<JobSchedulerSummary[]>
  removeScheduler: (key: string) => Promise<void>
  /** Scheduler name to preserve. Defaults to the canonical driver tick. */
  canonicalName?: string
}

export interface PruneSchedulersResult {
  removed: string[]
  kept: string[]
  failed: string[]
}

const DEFAULT_CANONICAL_NAME = 'scheduler-tick'

export async function pruneObsoleteSchedulers(
  deps: PruneSchedulersDeps,
): Promise<PruneSchedulersResult> {
  const canonicalName = deps.canonicalName ?? DEFAULT_CANONICAL_NAME
  const schedulers = await deps.listSchedulers()

  const removed: string[] = []
  const kept: string[] = []
  const failed: string[] = []

  for (const scheduler of schedulers) {
    if (scheduler.name === canonicalName) {
      kept.push(scheduler.key)
      continue
    }
    // One bad key (e.g. a transient Redis error) must not block cleanup of the
    // rest — record it and move on so the next boot can retry.
    try {
      await deps.removeScheduler(scheduler.key)
      removed.push(scheduler.key)
    } catch {
      failed.push(scheduler.key)
    }
  }

  return { removed, kept, failed }
}
