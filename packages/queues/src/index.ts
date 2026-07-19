import { Queue } from 'bullmq'
import { Redis as IORedis } from 'ioredis'

// ─── Redis connection ──────────────────────────────────────────────────────────

const redisUrl = process.env.REDIS_URL
if (!redisUrl) throw new Error('REDIS_URL is required')

export const redis = new IORedis(redisUrl, {
  maxRetriesPerRequest: null, // required by BullMQ
})

// ─── Queue names ──────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  REPOSITORY_ANALYSIS: 'repository-analysis',
  INCREMENTAL_UPDATE: 'incremental-update',
  TRANSLATION: 'translation',
  MIND_MAP: 'mind-map',
  WIKI_GENERATION: 'wiki-generation',
} as const

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]

// ─── Job data interfaces ───────────────────────────────────────────────────────

export interface RepositoryJobData {
  repositoryId: string
  branchId: string
  cloneUrl: string
  provider: 'github' | 'gitlab' | 'bitbucket'
}

export interface IncrementalJobData {
  repositoryId: string
  branchId: string
  fromCommit: string
  toCommit: string
  /** Set for runs created via the new run model; absent for legacy jobs. */
  runId?: string
  trigger?: 'scheduled' | 'manual'
}

export interface TranslationJobData {
  documentId: string
  targetLanguage: string
}

export interface MindMapJobData {
  repositoryId: string
  branchId: string
}

export interface WikiGenerationJobData {
  repositoryId: string
  branchId: string
  commitSha?: string
}

// ─── Shared job defaults (JDW-29) ────────────────────────────────────────────
//   attempts: 3, exponential backoff from 5 s, TTL for completed/failed jobs

const sharedJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { age: 86_400 },   // 24 h
  removeOnFail: { age: 604_800 },      // 7 d
}

// ─── Queue instances ──────────────────────────────────────────────────────────
// Priority: 1 = critical (repository), 2 = default (incremental), 3 = low (translation/mind-map)

export const repositoryQueue = new Queue<RepositoryJobData>(
  QUEUE_NAMES.REPOSITORY_ANALYSIS,
  {
    connection: redis,
    defaultJobOptions: { ...sharedJobOptions, priority: 1 },
  },
)

export const incrementalQueue = new Queue<IncrementalJobData>(
  QUEUE_NAMES.INCREMENTAL_UPDATE,
  {
    connection: redis,
    defaultJobOptions: { ...sharedJobOptions, priority: 2 },
  },
)

export const translationQueue = new Queue<TranslationJobData>(
  QUEUE_NAMES.TRANSLATION,
  {
    connection: redis,
    defaultJobOptions: { ...sharedJobOptions, priority: 3 },
  },
)

export const mindMapQueue = new Queue<MindMapJobData>(
  QUEUE_NAMES.MIND_MAP,
  {
    connection: redis,
    defaultJobOptions: { ...sharedJobOptions, priority: 3 },
  },
)

export const wikiGenerationQueue = new Queue<WikiGenerationJobData>(
  QUEUE_NAMES.WIKI_GENERATION,
  {
    connection: redis,
    defaultJobOptions: { ...sharedJobOptions, priority: 3 },
  },
)

// ─── Worker concurrency / rate-limiter defaults (JDW-29) ──────────────────────
// Imported by apps/worker to construct Worker instances with consistent config.

export const WORKER_CONFIG = {
  [QUEUE_NAMES.REPOSITORY_ANALYSIS]: {
    concurrency: 1,
    limiter: { max: 1, duration: 1_000 },
  },
  [QUEUE_NAMES.INCREMENTAL_UPDATE]: {
    concurrency: 1,
    limiter: { max: 1, duration: 1_000 },
  },
  [QUEUE_NAMES.TRANSLATION]: {
    concurrency: 5,
    limiter: { max: 5, duration: 1_000 },
  },
  [QUEUE_NAMES.MIND_MAP]: {
    concurrency: 5,
    limiter: { max: 5, duration: 1_000 },
  },
  [QUEUE_NAMES.WIKI_GENERATION]: {
    concurrency: 2,
    limiter: { max: 2, duration: 1_000 },
  },
} as const
