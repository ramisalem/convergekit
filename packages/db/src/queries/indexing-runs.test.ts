import { describe, expect, it } from 'vitest'

// These are pure-function tests, but indexing-runs.ts transitively imports the
// db client, which throws at import time when DATABASE_URL is unset (CI runs the
// db unit tests without a database). Match the search.test.ts pattern: set a
// placeholder URL and load the module dynamically so the import never throws.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://unit-test:unit-test@localhost:1/unit_test'
}

const {
  buildIncrementalIndexingSummaries,
  deriveIncrementalSummaryStatus,
  getNextScheduledIncrementalCheck,
} = await import('./indexing-runs.js')

const ACTIVE = { id: 'r1', status: 'processing' as const, jobId: 'j1', startedAt: null }

describe('getNextScheduledIncrementalCheck', () => {
  it('returns the next 6-hourly UTC boundary', () => {
    const now = new Date('2026-06-07T13:24:00.000Z')
    expect(getNextScheduledIncrementalCheck(now).toISOString()).toBe('2026-06-07T18:00:00.000Z')
  })

  it('rolls over to the next day after 18:00', () => {
    const now = new Date('2026-06-07T19:10:00.000Z')
    expect(getNextScheduledIncrementalCheck(now).toISOString()).toBe('2026-06-08T00:00:00.000Z')
  })

  it('returns the upcoming boundary, never the current exact boundary', () => {
    const now = new Date('2026-06-07T12:00:00.000Z')
    expect(getNextScheduledIncrementalCheck(now).toISOString()).toBe('2026-06-07T18:00:00.000Z')
  })
})

describe('deriveIncrementalSummaryStatus', () => {
  it('is paused when disabled regardless of runs', () => {
    expect(
      deriveIncrementalSummaryStatus({ enabled: false, pausedAt: null, activeRun: ACTIVE, lastRun: null }),
    ).toBe('paused')
  })

  it('is active when an active run exists and not paused', () => {
    expect(
      deriveIncrementalSummaryStatus({ enabled: true, pausedAt: null, activeRun: ACTIVE, lastRun: null }),
    ).toBe('active')
  })

  it('is not_checked with no runs', () => {
    expect(
      deriveIncrementalSummaryStatus({ enabled: true, pausedAt: null, activeRun: null, lastRun: null }),
    ).toBe('not_checked')
  })

  it('maps last completed run to changes_indexed', () => {
    expect(
      deriveIncrementalSummaryStatus({
        enabled: true,
        pausedAt: null,
        activeRun: null,
        lastRun: { status: 'completed', changedFileCount: 3 },
      }),
    ).toBe('changes_indexed')
  })

  it('maps completed_noop to fresh', () => {
    expect(
      deriveIncrementalSummaryStatus({
        enabled: true,
        pausedAt: null,
        activeRun: null,
        lastRun: { status: 'completed_noop', changedFileCount: 0 },
      }),
    ).toBe('fresh')
  })

  it('maps failed to failed', () => {
    expect(
      deriveIncrementalSummaryStatus({
        enabled: true,
        pausedAt: null,
        activeRun: null,
        lastRun: { status: 'failed', changedFileCount: 0 },
      }),
    ).toBe('failed')
  })

  it('is needs_reindex when indexed before commit tracking (no baseline)', () => {
    expect(
      deriveIncrementalSummaryStatus({
        enabled: true,
        pausedAt: null,
        activeRun: null,
        lastRun: null,
        lastIndexedAt: new Date('2026-05-01T00:00:00.000Z'),
        indexedCommitSha: null,
      }),
    ).toBe('needs_reindex')
  })

  it('prefers paused and active over needs_reindex', () => {
    expect(
      deriveIncrementalSummaryStatus({
        enabled: false,
        pausedAt: null,
        activeRun: null,
        lastRun: null,
        lastIndexedAt: new Date(),
        indexedCommitSha: null,
      }),
    ).toBe('paused')
    expect(
      deriveIncrementalSummaryStatus({
        enabled: true,
        pausedAt: null,
        activeRun: ACTIVE,
        lastRun: null,
        lastIndexedAt: new Date(),
        indexedCommitSha: null,
      }),
    ).toBe('active')
  })

  it('is not needs_reindex once a baseline commit exists', () => {
    expect(
      deriveIncrementalSummaryStatus({
        enabled: true,
        pausedAt: null,
        activeRun: null,
        lastRun: null,
        lastIndexedAt: new Date(),
        indexedCommitSha: 'aaa',
      }),
    ).toBe('not_checked')
  })
})

describe('buildIncrementalIndexingSummaries', () => {
  const repoA = 'a0000000-0000-4000-8000-000000000001'
  const now = new Date('2026-06-07T13:00:00.000Z')

  it('returns an entry per requested repository even with no rows', () => {
    const summaries = buildIncrementalIndexingSummaries([repoA], {
      branchRows: [],
      activeRunRows: [],
      lastRunRows: [],
      now,
    })
    const summary = summaries.get(repoA)
    expect(summary?.status).toBe('not_checked')
    expect(summary?.enabled).toBe(true)
    expect(summary?.activeRun).toBeNull()
    expect(summary?.lastRun).toBeNull()
  })

  it('serializes a completed last run and computes nextCheckAt', () => {
    const summaries = buildIncrementalIndexingSummaries([repoA], {
      branchRows: [{ repositoryId: repoA, incrementalIndexingEnabled: true, incrementalPausedAt: null }],
      activeRunRows: [],
      lastRunRows: [
        {
          repositoryId: repoA,
          id: 'run-1',
          status: 'completed',
          trigger: 'scheduled',
          fromCommit: 'aaa',
          toCommit: 'bbb',
          changedFileCount: 4,
          deletedFileCount: 1,
          skippedFileCount: 0,
          chunkCount: 12,
          failureReason: null,
          finishedAt: new Date('2026-06-07T12:50:00.000Z'),
        },
      ],
      now,
    })
    const summary = summaries.get(repoA)
    expect(summary?.status).toBe('changes_indexed')
    expect(summary?.lastRun?.changedFileCount).toBe(4)
    expect(summary?.nextCheckAt).toBe('2026-06-07T18:00:00.000Z')
    expect(summary?.lastCheckedAt).toBe('2026-06-07T12:50:00.000Z')
  })

  it('null nextCheckAt and paused status when paused', () => {
    const summaries = buildIncrementalIndexingSummaries([repoA], {
      branchRows: [
        {
          repositoryId: repoA,
          incrementalIndexingEnabled: true,
          incrementalPausedAt: new Date('2026-06-05T00:00:00.000Z'),
        },
      ],
      activeRunRows: [],
      lastRunRows: [],
      now,
    })
    expect(summaries.get(repoA)?.status).toBe('paused')
    expect(summaries.get(repoA)?.nextCheckAt).toBeNull()
  })

  it('reports needs_reindex for branches indexed before commit tracking', () => {
    const summaries = buildIncrementalIndexingSummaries([repoA], {
      branchRows: [
        {
          repositoryId: repoA,
          incrementalIndexingEnabled: true,
          incrementalPausedAt: null,
          lastIndexedAt: new Date('2026-05-01T00:00:00.000Z'),
          indexedCommitSha: null,
        },
      ],
      activeRunRows: [],
      lastRunRows: [],
      now,
    })
    expect(summaries.get(repoA)?.status).toBe('needs_reindex')
    expect(summaries.get(repoA)?.nextCheckAt).toBeNull()
  })
})
