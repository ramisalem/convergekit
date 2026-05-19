import { branches, db, documents, markBranchIndexed, upsertDocument } from '@convergekit/db'
import {
  computeLinkedCodeContentHashes,
  deriveEvidenceAlignmentStatus,
  extractEvidenceVerificationMetadata,
  extractLinkedCodePaths,
} from '@convergekit/db/evidence-alignment'
import { QUEUE_NAMES, WORKER_CONFIG, redis, type IncrementalJobData } from '@convergekit/queues'
import { Worker, type Job } from 'bullmq'
import { and, eq, sql } from 'drizzle-orm'
import { extname, join } from 'node:path'
import { simpleGit } from 'simple-git'
import { assertBranchEmbeddingCompatibility, getEmbeddingOptionsForRepo } from '../lib/ai.js'
import { flushChunkWrites, getIndexChunkBatchSize, type ChunkWrite } from '../lib/chunk-writes.js'
import { chunkDocument } from '../lib/chunker.js'
import { cleanupWorkspace, getFileSizeBytes, readFileContent } from '../lib/fs.js'
import {
  classifyRepositoryFile,
  summarizeSkippedFiles,
  type SkippedRepositoryFile,
} from '../lib/indexing-limits.js'
import { detectLanguage } from '../lib/language.js'
import { logger } from '../logger.js'

const WORKSPACE_DIR = process.env.WORKSPACE_DIR ?? '/tmp/convergekit-workspace'

async function processIncremental(job: Job<IncrementalJobData>): Promise<void> {
  const { repositoryId, branchId, fromCommit, toCommit } = job.data
  const workDir = join(WORKSPACE_DIR, `${repositoryId}-incremental`)

  const [branch] = await db.select().from(branches).where(eq(branches.id, branchId)).limit(1)

  if (!branch) throw new Error(`Branch ${branchId} not found`)

  await job.updateProgress(5)

  try {
    const git = simpleGit(workDir)

    // Fetch the range and get the diff
    await git.fetch(['origin'])
    await job.updateProgress(20)

    // More reliable: use git diff --name-status
    const diffOutput = await git.raw(['diff', '--name-status', fromCommit, toCommit])
    const changedFiles = parseDiffNameStatus(diffOutput)

    await job.updateProgress(40)

    // Delete removed documents (cascade deletes chunks)
    for (const path of changedFiles.deleted) {
      await db
        .delete(documents)
        .where(and(eq(documents.branchId, branchId), eq(documents.path, path)))
    }

    // Re-index added and modified files
    const toReindex = [...changedFiles.added, ...changedFiles.modified]
    const embeddingOptions = await getEmbeddingOptionsForRepo(repositoryId)
    assertBranchEmbeddingCompatibility(branch, embeddingOptions)
    const chunkBatchSize = getIndexChunkBatchSize()
    const chunkBatch: ChunkWrite[] = []
    const skippedFiles: SkippedRepositoryFile[] = []
    const contentByPath = new Map<string, string>()
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
      try {
        const content = await readFileContent(join(workDir, path))
        contentByPath.set(path, content)
        return content
      } catch {
        return undefined
      }
    }

    for (const path of toReindex) {
      const absPath = join(workDir, path)
      try {
        const sizeBytes = await getFileSizeBytes(absPath)
        const decision = classifyRepositoryFile(path, sizeBytes)
        if (!decision.index) {
          if (decision.reason !== 'unsupported-extension') {
            skippedFiles.push({ path, sizeBytes, reason: decision.reason, detail: decision.detail })
          }
          continue
        }

        const content = await readFileContent(absPath)
        contentByPath.set(path, content)
        const ext = extname(path)
        const programmingLanguage = detectLanguage(ext)
        const linkedCodePaths = decision.evidenceTier === 'D' ? extractLinkedCodePaths(content) : []
        const verificationMetadata =
          decision.evidenceTier === 'D' ? extractEvidenceVerificationMetadata(content) : null
        for (const linkedPath of linkedCodePaths) {
          await getContentForPath(linkedPath)
        }
        const linkedCodeContentHashes = computeLinkedCodeContentHashes(
          linkedCodePaths,
          contentByPath,
        )
        const verifiedContentHashes =
          verificationMetadata?.verifiedAgainstCommitSha === toCommit ? linkedCodeContentHashes : {}
        const evidenceAlignmentStatus =
          decision.evidenceTier === 'D'
            ? deriveEvidenceAlignmentStatus({
                linkedCodePaths,
                indexedCommitSha: toCommit,
                verifiedAgainstCommitSha: verificationMetadata?.verifiedAgainstCommitSha ?? null,
                linkedCodeContentHashes: verifiedContentHashes,
                currentLinkedCodeContentHashes: linkedCodeContentHashes,
              })
            : 'unverified'

        const doc = await upsertDocument(branchId, path, {
          content,
          programmingLanguage,
          docLanguage: 'en',
          evidenceTier: decision.evidenceTier,
          evidenceKind: decision.evidenceKind,
          searchByDefault: decision.searchByDefault,
          indexDecisionReason: decision.indexDecisionReason,
          lastVerifiedAgainstCodeAt: verificationMetadata?.lastVerifiedAgainstCodeAt ?? null,
          verifiedAgainstCommitSha: verificationMetadata?.verifiedAgainstCommitSha ?? null,
          evidenceAlignmentStatus,
          linkedCodePaths,
          linkedCodeContentHashes,
          updatedAt: new Date(),
        })
        if (doc) {
          const chunks = chunkDocument(path, content, programmingLanguage)
          for (const chunk of chunks) {
            chunkBatch.push({ documentId: doc.id, chunk })
            if (chunkBatch.length >= chunkBatchSize) {
              await flushBatch()
            }
          }
        }
      } catch {
        // File may have been deleted after diff; skip
      }
    }

    await flushBatch()

    await refreshLinkedHistoricalDocs({
      branchId,
      workDir,
      indexedCommitSha: toCommit,
      changedPaths: [...changedFiles.added, ...changedFiles.modified, ...changedFiles.deleted],
    })

    // Re-embed done: progress 90
    await job.updateProgress(90)

    await markBranchIndexed(branchId, toCommit)
    await job.updateProgress(100)

    logger.info(
      {
        repositoryId,
        branchId,
        added: changedFiles.added.length,
        modified: changedFiles.modified.length,
        deleted: changedFiles.deleted.length,
        chunkCount,
        skippedEmbeddings,
        skippedFiles: summarizeSkippedFiles(skippedFiles),
      },
      'Incremental index complete',
    )
  } finally {
    await cleanupWorkspace(workDir)
  }
}

async function refreshLinkedHistoricalDocs(input: {
  branchId: string
  workDir: string
  indexedCommitSha: string
  changedPaths: string[]
}): Promise<void> {
  const changedPaths = [...new Set(input.changedPaths)]
  if (changedPaths.length === 0) return

  const linkedDocs = await db
    .select({
      id: documents.id,
      linkedCodePaths: documents.linkedCodePaths,
      linkedCodeContentHashes: documents.linkedCodeContentHashes,
      verifiedAgainstCommitSha: documents.verifiedAgainstCommitSha,
    })
    .from(documents)
    .where(
      and(
        eq(documents.branchId, input.branchId),
        eq(documents.evidenceTier, 'D'),
        sql`${documents.linkedCodePaths} && ${changedPaths}::text[]`,
      ),
    )

  for (const doc of linkedDocs) {
    const linkedCodePaths = doc.linkedCodePaths ?? []
    const currentContentByPath = new Map<string, string>()
    for (const linkedPath of linkedCodePaths) {
      try {
        currentContentByPath.set(linkedPath, await readFileContent(join(input.workDir, linkedPath)))
      } catch {
        // Missing linked files make previously verified docs stale.
      }
    }

    const currentLinkedCodeContentHashes = computeLinkedCodeContentHashes(
      linkedCodePaths,
      currentContentByPath,
    )
    const evidenceAlignmentStatus = deriveEvidenceAlignmentStatus({
      linkedCodePaths,
      indexedCommitSha: input.indexedCommitSha,
      verifiedAgainstCommitSha: doc.verifiedAgainstCommitSha,
      linkedCodeContentHashes: doc.linkedCodeContentHashes ?? {},
      currentLinkedCodeContentHashes,
    })

    await db
      .update(documents)
      .set({ evidenceAlignmentStatus, updatedAt: new Date() })
      .where(eq(documents.id, doc.id))
  }
}

function parseDiffNameStatus(output: string): {
  added: string[]
  modified: string[]
  deleted: string[]
} {
  const added: string[] = []
  const modified: string[] = []
  const deleted: string[] = []

  for (const line of output.trim().split('\n')) {
    if (!line) continue
    const [status, ...parts] = line.split('\t')
    const file = parts[parts.length - 1]
    if (!file) continue

    if (status === 'A') added.push(file)
    else if (status === 'D') deleted.push(file)
    else modified.push(file) // M, R*, C*
  }

  return { added, modified, deleted }
}

export function createIncrementalWorker(): Worker<IncrementalJobData> {
  const config = WORKER_CONFIG[QUEUE_NAMES.INCREMENTAL_UPDATE]

  const worker = new Worker<IncrementalJobData>(
    QUEUE_NAMES.INCREMENTAL_UPDATE,
    processIncremental,
    {
      connection: redis,
      concurrency: config.concurrency,
      limiter: config.limiter,
    },
  )

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Incremental job failed')
  })

  return worker
}
