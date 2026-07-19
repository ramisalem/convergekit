import { describe, expect, it } from 'vitest'
import { serializeIndexingRunForResponse } from './incremental-indexing-response.js'

const base = {
  id: 'run-1',
  repositoryId: 'repo-1',
  branchId: 'branch-1',
  kind: 'incremental' as const,
  trigger: 'scheduled' as const,
  status: 'completed' as const,
  queueName: 'incremental-update',
  jobId: 'job-1',
  fromCommit: 'aaa',
  toCommit: 'bbb',
  remoteHead: 'bbb',
  changedFileCount: 3,
  deletedFileCount: 1,
  skippedFileCount: 0,
  chunkCount: 9,
  skippedEmbeddingCount: 0,
  failureReason: null,
  failureCode: null,
  startedAt: new Date('2026-06-07T12:00:00.000Z'),
  finishedAt: new Date('2026-06-07T12:00:30.000Z'),
  createdAt: new Date('2026-06-07T11:59:00.000Z'),
  updatedAt: new Date('2026-06-07T12:00:30.000Z'),
}

describe('serializeIndexingRunForResponse', () => {
  it('computes durationMs from started/finished', () => {
    expect(serializeIndexingRunForResponse(base).durationMs).toBe(30_000)
  })

  it('returns null duration when timestamps are missing', () => {
    expect(serializeIndexingRunForResponse({ ...base, finishedAt: null }).durationMs).toBeNull()
  })

  it('serializes timestamps to ISO strings', () => {
    expect(serializeIndexingRunForResponse(base).finishedAt).toBe('2026-06-07T12:00:30.000Z')
  })
})
