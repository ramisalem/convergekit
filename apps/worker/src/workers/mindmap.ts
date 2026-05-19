import { eq } from 'drizzle-orm'
import { type Job, Worker } from 'bullmq'
import { generateText } from 'ai'
import { db, documents } from '@convergekit/db'
import { upsertDocument } from '@convergekit/db'
import { getModel } from '@convergekit/ai'
import { type MindMapJobData, QUEUE_NAMES, WORKER_CONFIG, redis, wikiGenerationQueue } from '@convergekit/queues'
import { getModelOptionsForRepo } from '../lib/ai.js'
import { logger } from '../logger.js'

const MINDMAP_PATH = '__mindmap__'
const MAX_MINDMAP_FILES = 400
const MAX_MINDMAP_CHARS = 14_000

function buildMindMapFileInventory(
  docs: Array<{ path: string; programmingLanguage: string | null }>,
): { inventory: string; displayedFileCount: number; totalFileCount: number; omittedFileCount: number } {
  const lines = docs
    .filter((d) => d.path !== MINDMAP_PATH)
    .map((d) => `${d.path}${d.programmingLanguage ? ` [${d.programmingLanguage}]` : ''}`)

  const selected: string[] = []
  let totalChars = 0

  for (const line of lines) {
    const nextChars = totalChars + line.length + 1
    if (selected.length >= MAX_MINDMAP_FILES || (selected.length > 0 && nextChars > MAX_MINDMAP_CHARS)) {
      break
    }
    selected.push(line)
    totalChars = nextChars
  }

  const omittedFileCount = lines.length - selected.length
  const suffix = omittedFileCount > 0
    ? `\n... truncated ${omittedFileCount} additional files to keep the request concise`
    : ''

  return {
    inventory: selected.join('\n') + suffix,
    displayedFileCount: selected.length,
    totalFileCount: lines.length,
    omittedFileCount,
  }
}

async function processMindMap(job: Job<MindMapJobData>): Promise<void> {
  const { repositoryId, branchId } = job.data

  // Load all document paths for this branch
  const docs = await db
    .select({ path: documents.path, programmingLanguage: documents.programmingLanguage })
    .from(documents)
    .where(eq(documents.branchId, branchId))

  if (docs.length === 0) throw new Error(`No documents found for branch ${branchId}`)

  await job.updateProgress(20)

  const {
    inventory,
    displayedFileCount,
    totalFileCount,
    omittedFileCount,
  } = buildMindMapFileInventory(docs)

  const modelOptions = await getModelOptionsForRepo(repositoryId)

  const { text, reasoningText } = await generateText({
    model: getModel('mindmap', modelOptions),
    system: `You are a code repository analyst. Return ONLY valid JSON, no prose, no markdown fences, no explanation. Given a list of file paths, produce a hierarchical JSON mind map with this exact schema: { "name": string, "description": string, "children": [{ "name": string, "description": string, "files": string[], "children"?: [...] }] }`,
    prompt: `Repository file inventory (${displayedFileCount} of ${totalFileCount} files shown${omittedFileCount > 0 ? ', truncated for brevity' : ''}):\n${inventory}`,
    // qwen3.5-9b (thinking model) may spend 1000-3000 tokens on internal reasoning
    // before producing output — maxOutputTokens must cover reasoning + JSON output
    maxOutputTokens: 8192,
    temperature: 0,
  })

  await job.updateProgress(80)

  // Thinking models may return content in `reasoning` when `text` is empty
  const raw = text || reasoningText || ''
  if (!raw) {
    throw new Error('LLM returned empty response for mindmap generation — check model is loaded and maxOutputTokens is sufficient')
  }
  // Strip markdown fences the model sometimes wraps around JSON
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim()
  JSON.parse(cleaned)

  await upsertDocument(branchId, MINDMAP_PATH, {
    content: cleaned,
    programmingLanguage: null,
    docLanguage: 'en',
    updatedAt: new Date(),
  })

  await job.updateProgress(100)
  logger.info({
    repositoryId,
    branchId,
    fileCount: totalFileCount,
    displayedFileCount,
    omittedFileCount,
  }, 'Mind map generated')

  // Trigger wiki generation now that the mindmap is ready
  await wikiGenerationQueue.add('generate', { repositoryId, branchId })
}

export function createMindMapWorker(): Worker<MindMapJobData> {
  const config = WORKER_CONFIG[QUEUE_NAMES.MIND_MAP]

  const worker = new Worker<MindMapJobData>(
    QUEUE_NAMES.MIND_MAP,
    processMindMap,
    {
      connection: redis,
      concurrency: config.concurrency,
      limiter: config.limiter,
    },
  )

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, repositoryId: job?.data.repositoryId, err }, 'Mind map job failed')
  })

  return worker
}
