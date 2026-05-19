import { eq } from 'drizzle-orm'
import { type Job, Worker } from 'bullmq'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { db, documents } from '@convergekit/db'
import { upsertDocument } from '@convergekit/db'
import { type TranslationJobData, QUEUE_NAMES, WORKER_CONFIG, redis } from '@convergekit/queues'
import { logger } from '../logger.js'

async function processTranslation(job: Job<TranslationJobData>): Promise<void> {
  const { documentId, targetLanguage } = job.data

  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1)
  if (!doc) throw new Error(`Document ${documentId} not found`)

  await job.updateProgress(10)

  const { text } = await generateText({
    // Use the faster/cheaper model tier for translation
    model: anthropic('claude-haiku-4-5-20251001'),
    system: `You are a professional technical translator. Translate the provided source code documentation, comments, and text content into ${targetLanguage}. Preserve all code syntax, variable names, function names, and file paths exactly as-is. Only translate natural language text (comments, docstrings, markdown prose). Return only the translated content with no preamble.`,
    prompt: doc.content,
  })

  await job.updateProgress(80)

  await upsertDocument(doc.branchId, doc.path, {
    content: text,
    programmingLanguage: doc.programmingLanguage,
    docLanguage: targetLanguage,
    updatedAt: new Date(),
  })

  await job.updateProgress(100)
  logger.info({ documentId, targetLanguage }, 'Translation complete')
}

export function createTranslationWorker(): Worker<TranslationJobData> {
  const config = WORKER_CONFIG[QUEUE_NAMES.TRANSLATION]

  const worker = new Worker<TranslationJobData>(
    QUEUE_NAMES.TRANSLATION,
    processTranslation,
    {
      connection: redis,
      concurrency: config.concurrency,
      limiter: config.limiter,
    },
  )

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, documentId: job?.data.documentId, err }, 'Translation job failed')
  })

  return worker
}
