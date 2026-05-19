import { createRepositoryWorker } from './workers/repository.js'
import { createIncrementalWorker } from './workers/incremental.js'
import { createTranslationWorker } from './workers/translation.js'
import { createMindMapWorker } from './workers/mindmap.js'
import { createWikiWorker } from './workers/wiki.js'
import { scheduleIncrementalJobs } from './scheduler.js'
import { logger } from './logger.js'

const workers = [
  createRepositoryWorker(),
  createIncrementalWorker(),
  createTranslationWorker(),
  createMindMapWorker(),
  createWikiWorker(),
]

logger.info({ count: workers.length }, 'Workers started')

// Register repeatable incremental sync jobs for all active repositories
scheduleIncrementalJobs().catch((err) => {
  logger.error({ err }, 'Failed to schedule incremental jobs')
})

async function shutdown(): Promise<void> {
  logger.info('Shutting down workers...')
  await Promise.all(workers.map((w) => w.close()))
  process.exit(0)
}

process.on('SIGTERM', () => { void shutdown() })
process.on('SIGINT', () => { void shutdown() })
