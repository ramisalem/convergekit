import {
  branches,
  db,
  documents,
  formatIncrementalFailure,
  getIndexingRunById,
  isRetryableIncrementalFailure,
  markBranchIndexed,
  redactUrlCredentials,
  resolveAuthenticatedCloneUrl,
  updateIndexingRun,
  upsertDocument,
} from '@convergekit/db'
import {
  computeLinkedCodeContentHashes,
  deriveEvidenceAlignmentStatus,
  extractEvidenceVerificationMetadata,
  extractLinkedCodePaths,
} from '@convergekit/db/evidence-alignment'
import { QUEUE_NAMES, WORKER_CONFIG, redis, type IncrementalJobData } from '@convergekit/queues'
import { UnrecoverableError, Worker, type Job } from 'bullmq'
import { and, arrayOverlaps, eq } from 'drizzle-orm'
import { extname, join } from 'node:path'
import { simpleGit } from 'simple-git'
import { assertBranchEmbeddingCompatibility, getEmbeddingOptionsForRepo } from '../lib/ai.js'
import { flushChunkWrites, getIndexChunkBatchSize, type ChunkWrite } from '../lib/chunk-writes.js'
import { chunkDocument } from '../lib/chunker.js'
import { isShaLike } from '../lib/commit-range.js'
import { cleanupWorkspace, getFileSizeBytes, readFileContent } from '../lib/fs.js'
import {
  classifyRepositoryFile,
  summarizeSkippedFiles,
  type SkippedRepositoryFile,
} from '../lib/indexing-limits.js'
import { detectLanguage } from '../lib/language.js'
import { logger } from '../logger.js'
import { runIncrementalCheckSweep } from '../scheduler.js'

const WORKSPACE_DIR = process.env.WORKSPACE_DIR ?? '/tmp/convergekit-workspace'

async function processIncremental(job: Job<IncrementalJobData>): Promise<void> {
  if (job.name === 'scheduler-tick') {
    await runIncrementalCheckSweep()
    return
  }

  const { repositoryId, branchId, fromCommit, toCommit } = job.data
  const runId = job.data.runId
  const workDir = join(WORKSPACE_DIR, `${repositoryId}-incremental`)

  // Guard against orphaned jobs from earlier scheduler designs whose data carries
  // a relative ref (e.g. fromCommit:'HEAD~1') instead of a resolved SHA. The
  // current scheduler only enqueues explicit SHAs, so anything else is unrunnable;
  // fail fast instead of cloning and retrying 3×.
  if (!isShaLike(fromCommit) || !isShaLike(toCommit)) {
    throw new UnrecoverableError(
      `Refusing incremental job with non-SHA commit range ${fromCommit}..${toCommit} (orphaned scheduler job)`,
    )
  }

  const [branch] = await db.select().from(branches).where(eq(branches.id, branchId)).limit(1)

  if (!branch) throw new Error(`Branch ${branchId} not found`)

  if (runId) {
    await updateIndexingRun(runId, { status: 'processing', startedAt: new Date() })
  }
  await job.updateProgress(5)

  try {
    // Own the workspace lifecycle: clean any stale dir, then clone fresh enough
    // history to diff fromCommit -> toCommit and read files at toCommit.
    await cleanupWorkspace(workDir)
    const cloneUrl = await resolveAuthenticatedCloneUrl(repositoryId)
    if (!cloneUrl) throw new Error('Unable to resolve clone credentials')
    const git = simpleGit()
    try {
      await git.clone(cloneUrl, workDir)
    } catch (err) {
      // simple-git's GitError embeds the authenticated clone URL (with token)
      // in its message/command list — redact before it can reach any log.
      throw new Error(redactUrlCredentials(err instanceof Error ? err.message : String(err)))
    }
    const repoGit = simpleGit(workDir)
    await repoGit.checkout(toCommit)
    await job.updateProgress(20)

    // More reliable: use git diff --name-status
    const diffOutput = await repoGit.raw(['diff', '--name-status', fromCommit, toCommit])
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

    // Stale-worker guard: if a full re-index superseded this run, do NOT advance
    // branch state. The full re-index is authoritative.
    if (runId) {
      const current = await getIndexingRunById(runId)
      if (!current || current.status !== 'processing') {
        logger.warn(
          { repositoryId, branchId, runId, status: current?.status },
          'Incremental run superseded; skipping branch advancement',
        )
        return
      }
    }

    // Record the run as completed BEFORE advancing the branch, and make
    // markBranchIndexed the last operation that can throw. This guarantees we
    // never persist a `failed` run while the branch is actually fresh: if the
    // completed-write (or progress ping) fails the branch has not advanced yet,
    // so the catch's `failed` record is truthful and the next check retries.
    if (runId) {
      await updateIndexingRun(runId, {
        status: 'completed',
        changedFileCount: changedFiles.added.length + changedFiles.modified.length,
        deletedFileCount: changedFiles.deleted.length,
        skippedFileCount: skippedFiles.length,
        chunkCount,
        skippedEmbeddingCount: skippedEmbeddings,
        finishedAt: new Date(),
      })
    }

    await job.updateProgress(100)
    await markBranchIndexed(branchId, toCommit)

    logger.info(
      {
        repositoryId,
        branchId,
        runId,
        added: changedFiles.added.length,
        modified: changedFiles.modified.length,
        deleted: changedFiles.deleted.length,
        chunkCount,
        skippedEmbeddings,
        skippedFiles: summarizeSkippedFiles(skippedFiles),
      },
      'Incremental index complete',
    )
  } catch (err) {
    const { failureReason, failureCode } = formatIncrementalFailure(
      err instanceof Error ? err.message : String(err),
    )
    if (runId) {
      // Leave branches.indexedCommitSha at the previous successful commit and do
      // not mark the repository failed — existing docs remain usable.
      await updateIndexingRun(runId, {
        status: 'failed',
        failureReason,
        failureCode,
        finishedAt: new Date(),
      }).catch(() => undefined)
    }
    // Log every failed attempt — the worker 'failed' handler only fires after the
    // final retry. Log the sanitized reason/code, never the raw error.
    logger.error(
      { repositoryId, branchId, runId, failureCode },
      `Incremental run failed: ${failureReason}`,
    )
    // Non-transient failures won't succeed on retry; stop BullMQ from re-cloning
    // and re-embedding for nothing.
    if (!isRetryableIncrementalFailure(failureCode)) {
      throw new UnrecoverableError(failureReason)
    }
    throw err
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
        arrayOverlaps(documents.linkedCodePaths, changedPaths),
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
