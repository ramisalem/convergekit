import {
  branches,
  createIndexingRun,
  db,
  getActiveIncrementalRun,
  performIncrementalCheck,
  reapStaleIncrementalRuns,
  repositories,
  resolveAuthenticatedCloneUrl,
  updateIndexingRun,
} from '@convergekit/db'
import { incrementalQueue, QUEUE_NAMES } from '@convergekit/queues'
import { eq, isNull } from 'drizzle-orm'
import { resolveRemoteHead } from './lib/git-remote.js'
import { pruneObsoleteSchedulers } from './lib/scheduler-maintenance.js'
import { logger } from './logger.js'

const REPEAT_CRON = '0 */6 * * *'

/**
 * JDW-33 (rev): run every 6 hours. For each fully-indexed, non-paused branch
 * resolve the remote head and either record a no-op run or queue an exact
 * incremental job. A single repeatable scheduler job drives the loop.
 */
export async function scheduleIncrementalJobs(): Promise<void> {
  // One repeatable driver job; the worker's scheduler-tick consumer runs the
  // loop. For local/dev we also run the loop immediately on boot.
  await incrementalQueue.add(
    'scheduler-tick',
    { repositoryId: '__scheduler__', branchId: '__scheduler__', fromCommit: '', toCommit: '' },
    { repeat: { pattern: REPEAT_CRON }, jobId: 'incremental-scheduler-tick' },
  )

  // Self-heal: remove repeatable schedulers left over from earlier incremental
  // designs (per-repo 'sync' jobs with fromCommit:'HEAD~1') that BullMQ persists
  // in Redis across deploys and that otherwise fire + fail forever. The single
  // 'scheduler-tick' is the only repeatable the current design needs.
  const pruned = await pruneObsoleteSchedulers({
    listSchedulers: async () =>
      (await incrementalQueue.getJobSchedulers()).map((s) => ({ key: s.key, name: s.name ?? '' })),
    removeScheduler: async (key) => {
      try {
        await incrementalQueue.removeJobScheduler(key)
      } catch {
        // Fall back to the legacy repeatable API for schedulers created by the
        // old `queue.add(name, data, { repeat })` path.
        await incrementalQueue.removeRepeatableByKey(key).catch(() => undefined)
      }
    },
  })
  if (pruned.removed.length > 0 || pruned.failed.length > 0) {
    logger.warn(
      { removed: pruned.removed.length, failed: pruned.failed.length },
      'Pruned obsolete incremental schedulers',
    )
  }

  await runIncrementalCheckSweep()
}

export async function runIncrementalCheckSweep(): Promise<void> {
  // Reap orphaned runs first (e.g. left behind by a worker crash) so a dead
  // active run can't block this repo's checks forever. Runs on boot + every tick.
  const reaped = await reapStaleIncrementalRuns()
  if (reaped.length > 0) {
    logger.warn({ count: reaped.length }, 'Reaped stale incremental runs')
  }

  const activeRepos = await db
    .select({ id: repositories.id })
    .from(repositories)
    .where(isNull(repositories.deletedAt))

  for (const repo of activeRepos) {
    const [branch] = await db
      .select({
        id: branches.id,
        name: branches.name,
        lastIndexedAt: branches.lastIndexedAt,
        indexedCommitSha: branches.indexedCommitSha,
        enabled: branches.incrementalIndexingEnabled,
      })
      .from(branches)
      .where(eq(branches.repositoryId, repo.id))
      .limit(1)

    if (!branch?.lastIndexedAt) continue // never fully indexed
    if (!branch.enabled) continue // automatic checks paused

    const cloneUrl = await resolveAuthenticatedCloneUrl(repo.id)
    if (!cloneUrl) {
      logger.warn({ repositoryId: repo.id }, 'Skipping incremental check: no clone credentials')
      continue
    }

    try {
      const result = await performIncrementalCheck(
        {
          getActiveIncrementalRun,
          resolveRemoteHead: async ({ branchName }) => {
            const resolved = await resolveRemoteHead(cloneUrl, branchName)
            if (resolved.branch !== branchName) {
              // The stored branch name was stale or never the real default; the
              // remote default (HEAD) is what the full index actually recorded.
              // Repair it so the UI and future checks use the correct branch.
              await db
                .update(branches)
                .set({ name: resolved.branch })
                .where(eq(branches.id, branch.id))
              logger.warn(
                {
                  repositoryId: repo.id,
                  branchId: branch.id,
                  storedBranch: branchName,
                  resolvedBranch: resolved.branch,
                },
                'Repaired stale branch name to remote default',
              )
            }
            return resolved.sha
          },
          createIndexingRun,
          updateIndexingRun,
          enqueueIncremental: async (input) => {
            const job = await incrementalQueue.add('sync', {
              repositoryId: input.repositoryId,
              branchId: input.branchId,
              fromCommit: input.fromCommit,
              toCommit: input.toCommit,
              runId: input.runId,
              trigger: input.trigger,
            })
            return { queueName: QUEUE_NAMES.INCREMENTAL_UPDATE, jobId: String(job.id) }
          },
        },
        {
          repositoryId: repo.id,
          branchId: branch.id,
          branchName: branch.name,
          trigger: 'scheduled',
          lastIndexedAt: branch.lastIndexedAt,
          enabled: branch.enabled,
          indexedCommitSha: branch.indexedCommitSha,
        },
      )
      logger.info(
        {
          repositoryId: repo.id,
          branchId: branch.id,
          outcome: result.outcome,
          runId: 'run' in result ? result.run.id : null,
        },
        'Incremental check complete',
      )
    } catch (err) {
      logger.error({ repositoryId: repo.id, err }, 'Incremental check failed')
    }
  }
}
