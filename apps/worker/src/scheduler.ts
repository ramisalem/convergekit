import { eq, isNull } from 'drizzle-orm'
import { db, repositories, branches } from '@convergekit/db'
import { incrementalQueue } from '@convergekit/queues'
import { logger } from './logger.js'

/**
 * JDW-33: Register a repeatable incremental sync job for every active repository.
 * Runs every 6 hours. Idempotent — BullMQ deduplicates by repeat key.
 */
export async function scheduleIncrementalJobs(): Promise<void> {
  const activeRepos = await db
    .select({
      id: repositories.id,
      cloneUrl: repositories.cloneUrl,
      provider: repositories.provider,
    })
    .from(repositories)
    .where(isNull(repositories.deletedAt))

  for (const repo of activeRepos) {
    const [branch] = await db
      .select({ id: branches.id, lastIndexedAt: branches.lastIndexedAt })
      .from(branches)
      .where(eq(branches.repositoryId, repo.id))
      .limit(1)

    if (!branch?.lastIndexedAt) continue // not yet fully indexed

    await incrementalQueue.add(
      'sync',
      {
        repositoryId: repo.id,
        branchId: branch.id,
        fromCommit: 'HEAD~1',
        toCommit: 'HEAD',
      },
      {
        repeat: { pattern: '0 */6 * * *' },
        jobId: `sync:${repo.id}`, // ensures one repeatable entry per repo
      },
    )

    logger.info({ repositoryId: repo.id }, 'Scheduled incremental sync')
  }
}
