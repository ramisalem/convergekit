import type { IndexingRun } from '@convergekit/db'

export type IndexingRunResponse = {
  id: string
  kind: 'full' | 'incremental'
  trigger: 'scheduled' | 'manual' | 'full_reindex'
  status: string
  fromCommit: string | null
  toCommit: string | null
  changedFileCount: number
  deletedFileCount: number
  skippedFileCount: number
  chunkCount: number
  failureReason: string | null
  failureCode: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  durationMs: number | null
}

export function serializeIndexingRunForResponse(run: IndexingRun): IndexingRunResponse {
  const startedAt = run.startedAt ? new Date(run.startedAt) : null
  const finishedAt = run.finishedAt ? new Date(run.finishedAt) : null
  return {
    id: run.id,
    kind: run.kind,
    trigger: run.trigger,
    status: run.status,
    fromCommit: run.fromCommit,
    toCommit: run.toCommit,
    changedFileCount: run.changedFileCount,
    deletedFileCount: run.deletedFileCount,
    skippedFileCount: run.skippedFileCount,
    chunkCount: run.chunkCount,
    failureReason: run.failureReason,
    failureCode: run.failureCode,
    startedAt: startedAt?.toISOString() ?? null,
    finishedAt: finishedAt?.toISOString() ?? null,
    createdAt: new Date(run.createdAt).toISOString(),
    durationMs: startedAt && finishedAt ? finishedAt.getTime() - startedAt.getTime() : null,
  }
}
