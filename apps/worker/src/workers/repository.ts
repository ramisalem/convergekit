import { branches, db, markBranchIndexed, updateRepositoryStatus, upsertDocument } from '@convergekit/db'
import {
  computeLinkedCodeContentHashes,
  deriveEvidenceAlignmentStatus,
  extractEvidenceVerificationMetadata,
  extractLinkedCodePaths,
} from '@convergekit/db/evidence-alignment'
import {
  type RepositoryJobData,
  QUEUE_NAMES,
  WORKER_CONFIG,
  mindMapQueue,
  redis,
} from '@convergekit/queues'
import { type Job, Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import { extname, join } from 'node:path'
import { simpleGit } from 'simple-git'
import { captureBranchEmbeddingProfile, getEmbeddingOptionsForRepo } from '../lib/ai.js'
import { type ChunkWrite, flushChunkWrites, getIndexChunkBatchSize } from '../lib/chunk-writes.js'
import { chunkDocument } from '../lib/chunker.js'
import { cleanupWorkspace, readFileContent, walkRepositoryFiles } from '../lib/fs.js'
import { summarizeSkippedFiles } from '../lib/indexing-limits.js'
import { detectLanguage } from '../lib/language.js'
import { summarizeErrorForLog } from '../lib/logging.js'
import { logger } from '../logger.js'

const WORKSPACE_DIR = process.env.WORKSPACE_DIR ?? '/tmp/convergekit-workspace'

async function processRepository(job: Job<RepositoryJobData>): Promise<void> {
  const { repositoryId, branchId, cloneUrl } = job.data
  const workDir = join(WORKSPACE_DIR, repositoryId)

  await updateRepositoryStatus(repositoryId, 'processing')
  await job.updateProgress(5)

  try {
    await cleanupWorkspace(workDir)

    // Stage 1: clone
    logger.info({ repositoryId }, 'Cloning repository')
    const git = simpleGit()
    await git.clone(cloneUrl, workDir, ['--depth', '1'])
    const repoGit = simpleGit(workDir)
    const indexedCommitSha = (await repoGit.revparse(['HEAD'])).trim()
    await job.updateProgress(10)

    // Stage 2: walk
    logger.info({ workDir }, 'Walking file tree')
    const { files, skipped } = await walkRepositoryFiles(workDir)
    const skippedSummary = summarizeSkippedFiles(skipped)
    logger.info(
      {
        repositoryId,
        fileCount: files.length,
        skipped: skippedSummary,
        skippedSamples: skipped.slice(0, 10),
      },
      'Repository file selection complete',
    )
    await job.updateProgress(25)

    // Stage 3: write documents and chunks in bounded batches
    const [branch] = await db.select().from(branches).where(eq(branches.id, branchId)).limit(1)

    if (!branch) throw new Error(`Branch ${branchId} not found`)

    const embeddingOptions = await getEmbeddingOptionsForRepo(repositoryId)
    const embeddingProfile = await captureBranchEmbeddingProfile(branchId, embeddingOptions)
    const chunkBatchSize = getIndexChunkBatchSize()
    const chunkBatch: ChunkWrite[] = []
    const contentByPath = new Map<string, string>()
    const absolutePathByPath = new Map(files.map((file) => [file.path, file.absolutePath]))
    let written = 0
    let chunkCount = 0
    let skippedEmbeddings = 0

    async function flushBatch(): Promise<void> {
      if (chunkBatch.length === 0) return

      const flushed = await flushChunkWrites(chunkBatch, embeddingOptions)
      chunkCount += flushed.written
      skippedEmbeddings += flushed.skippedEmbeddings
      chunkBatch.length = 0
    }

    async function getContentForPath(path: string): Promise<string | undefined> {
      const cached = contentByPath.get(path)
      if (cached !== undefined) return cached
      const absolutePath = absolutePathByPath.get(path)
      if (!absolutePath) return undefined
      const content = await readFileContent(absolutePath)
      contentByPath.set(path, content)
      return content
    }

    for (const file of files) {
      const content = await getContentForPath(file.path)
      if (content === undefined) continue
      const ext = extname(file.path)
      const programmingLanguage = detectLanguage(ext)
      const linkedCodePaths =
        file.decision.evidenceTier === 'D' ? extractLinkedCodePaths(content) : []
      const verificationMetadata =
        file.decision.evidenceTier === 'D' ? extractEvidenceVerificationMetadata(content) : null
      for (const linkedPath of linkedCodePaths) {
        await getContentForPath(linkedPath)
      }
      const linkedCodeContentHashes = computeLinkedCodeContentHashes(linkedCodePaths, contentByPath)
      const verifiedContentHashes =
        verificationMetadata?.verifiedAgainstCommitSha === indexedCommitSha
          ? linkedCodeContentHashes
          : {}
      const evidenceAlignmentStatus =
        file.decision.evidenceTier === 'D'
          ? deriveEvidenceAlignmentStatus({
              linkedCodePaths,
              indexedCommitSha,
              verifiedAgainstCommitSha: verificationMetadata?.verifiedAgainstCommitSha ?? null,
              linkedCodeContentHashes: verifiedContentHashes,
              currentLinkedCodeContentHashes: linkedCodeContentHashes,
            })
          : 'unverified'

      const doc = await upsertDocument(branchId, file.path, {
        content,
        programmingLanguage,
        docLanguage: 'en',
        evidenceTier: file.decision.evidenceTier,
        evidenceKind: file.decision.evidenceKind,
        searchByDefault: file.decision.searchByDefault,
        indexDecisionReason: file.decision.indexDecisionReason,
        lastVerifiedAgainstCodeAt: verificationMetadata?.lastVerifiedAgainstCodeAt ?? null,
        verifiedAgainstCommitSha: verificationMetadata?.verifiedAgainstCommitSha ?? null,
        evidenceAlignmentStatus,
        linkedCodePaths,
        linkedCodeContentHashes,
        updatedAt: new Date(),
      })
      written++

      if (doc) {
        const chunks = chunkDocument(file.path, content, programmingLanguage)
        for (const chunk of chunks) {
          chunkBatch.push({ documentId: doc.id, chunk })
          if (chunkBatch.length >= chunkBatchSize) {
            await flushBatch()
          }
        }
      }

      if (written % 50 === 0) {
        const pct = 25 + Math.floor((written / files.length) * 55)
        await job.updateProgress(pct)
      }
    }

    await flushBatch()

    await job.updateProgress(80)
    logger.info(
      {
        repositoryId,
        written,
        chunkCount,
        skippedEmbeddings,
        skippedFiles: skippedSummary,
        embeddingModel: embeddingProfile.model,
        embeddingDimensions: embeddingProfile.dimensions,
      },
      'Documents and chunks written',
    )

    await job.updateProgress(95)
    await markBranchIndexed(branchId, indexedCommitSha)
    await updateRepositoryStatus(repositoryId, 'done')
    await job.updateProgress(100)

    logger.info(
      { repositoryId, written, chunkCount, skippedFiles: skippedSummary },
      'Repository indexed',
    )

    // Trigger mind map generation (which chains into wiki generation).
    // The repository is already usable at this point, so downstream
    // documentation failures should not force a full re-index.
    await mindMapQueue.add('generate', { repositoryId, branchId })
  } finally {
    await cleanupWorkspace(workDir)
  }
}

export function createRepositoryWorker(): Worker<RepositoryJobData> {
  const config = WORKER_CONFIG[QUEUE_NAMES.REPOSITORY_ANALYSIS]

  const worker = new Worker<RepositoryJobData>(QUEUE_NAMES.REPOSITORY_ANALYSIS, processRepository, {
    connection: redis,
    concurrency: config.concurrency,
    limiter: config.limiter,
  })

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, repositoryId: job?.data.repositoryId, err: summarizeErrorForLog(err) },
      'Repository job failed',
    )
    if (job?.data.repositoryId) {
      void updateRepositoryStatus(job.data.repositoryId, 'failed').catch(() => undefined)
    }
  })

  return worker
}
