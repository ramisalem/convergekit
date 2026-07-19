import { describe, expect, it } from 'vitest'
import {
  formatHeaderIncrementalStrip,
  formatRepositoryListFreshnessLine,
  type IncrementalIndexingSummary,
} from './incremental-freshness.js'

const now = new Date('2026-06-07T13:00:00.000Z')

function summary(overrides: Partial<IncrementalIndexingSummary> = {}): IncrementalIndexingSummary {
  return {
    enabled: true,
    status: 'fresh',
    lastCheckedAt: '2026-06-07T12:48:00.000Z',
    nextCheckAt: '2026-06-07T18:00:00.000Z',
    activeRun: null,
    lastRun: {
      id: 'run-1',
      status: 'completed_noop',
      trigger: 'scheduled',
      fromCommit: 'aaa',
      toCommit: 'aaa',
      changedFileCount: 0,
      deletedFileCount: 0,
      skippedFileCount: 0,
      chunkCount: 0,
      failureReason: null,
      finishedAt: '2026-06-07T12:48:00.000Z',
    },
    ...overrides,
  }
}

describe('formatRepositoryListFreshnessLine', () => {
  it('shows checked + next check + no changes', () => {
    expect(formatRepositoryListFreshnessLine(summary(), now)).toBe(
      'Last checked 12m ago · Next check in 5h · Last check: no changes',
    )
  })

  it('shows changed file count', () => {
    const line = formatRepositoryListFreshnessLine(
      summary({
        status: 'changes_indexed',
        lastRun: { ...summary().lastRun!, status: 'completed', changedFileCount: 6 },
      }),
      now,
    )
    expect(line).toBe('Last checked 12m ago · Next check in 5h · Last check: 6 files changed')
  })

  it('shows an actionable failure line', () => {
    const line = formatRepositoryListFreshnessLine(
      summary({
        status: 'failed',
        lastRun: {
          ...summary().lastRun!,
          status: 'failed',
          failureReason: 'OpenRouter key limit exceeded. ... Advanced Settings.',
        },
      }),
      now,
    )
    expect(line).toContain('Last check failed')
    expect(line).toContain('Advanced Settings')
  })

  it('shows paused state', () => {
    expect(
      formatRepositoryListFreshnessLine(summary({ status: 'paused', nextCheckAt: null }), now),
    ).toBe('Automatic checks paused · Last checked 12m ago')
  })

  it('shows not-checked-yet state', () => {
    expect(
      formatRepositoryListFreshnessLine(
        summary({ status: 'not_checked', lastCheckedAt: null, lastRun: null }),
        now,
      ),
    ).toBe('Not checked yet · Next check in 5h')
  })

  it('nudges a re-index when there is no baseline commit', () => {
    expect(
      formatRepositoryListFreshnessLine(
        summary({ status: 'needs_reindex', lastCheckedAt: null, nextCheckAt: null, lastRun: null }),
        now,
      ),
    ).toBe('Re-index once to enable incremental checks')
  })

  it('returns null when summary is undefined', () => {
    expect(formatRepositoryListFreshnessLine(undefined, now)).toBeNull()
  })

  it('shows checking-now for an active run', () => {
    expect(formatRepositoryListFreshnessLine(summary({ status: 'active' }), now)).toBe(
      'Checking now · Next check in 5h',
    )
  })

  it('formats day-scale and just-now relative times', () => {
    const old = formatRepositoryListFreshnessLine(
      summary({ lastCheckedAt: '2026-06-04T13:00:00.000Z' }),
      now,
    )
    expect(old).toContain('3d ago')
    const recent = formatRepositoryListFreshnessLine(
      summary({ lastCheckedAt: '2026-06-07T12:59:30.000Z' }),
      now,
    )
    expect(recent).toContain('just now')
  })

  it('omits the next-check segment when the scheduled time has already elapsed', () => {
    const line = formatRepositoryListFreshnessLine(
      summary({ nextCheckAt: '2026-06-07T12:00:00.000Z' }),
      now,
    )
    expect(line).toBe('Last checked 12m ago · Last check: no changes')
    expect(line).not.toContain('Next check')
    expect(line).not.toContain('soon')
  })

  it('singularizes a one-file change', () => {
    const line = formatRepositoryListFreshnessLine(
      summary({
        status: 'changes_indexed',
        lastRun: { ...summary().lastRun!, status: 'completed', changedFileCount: 1 },
      }),
      now,
    )
    expect(line).toContain('1 file changed')
  })
})

describe('formatHeaderIncrementalStrip', () => {
  it('returns null when summary is undefined', () => {
    expect(formatHeaderIncrementalStrip(undefined, now)).toBeNull()
  })

  it('renders a fresh strip with last-checked, next-check and change summary', () => {
    const strip = formatHeaderIncrementalStrip(summary(), now)
    expect(strip).toMatchObject({
      state: 'fresh',
      headline: 'Incremental indexing active',
      lastChecked: '12m ago',
      nextCheck: '5h',
      lastCheck: 'no changes',
    })
  })

  it('renders an active strip', () => {
    expect(formatHeaderIncrementalStrip(summary({ status: 'active' }), now)?.state).toBe('active')
  })

  it('renders a paused strip with no next check', () => {
    const strip = formatHeaderIncrementalStrip(summary({ status: 'paused', nextCheckAt: null }), now)
    expect(strip?.state).toBe('paused')
    expect(strip?.headline).toBe('Incremental indexing paused')
    expect(strip?.nextCheck).toBeNull()
  })

  it('renders a failed strip with the failure reason and a fallback', () => {
    const withReason = formatHeaderIncrementalStrip(
      summary({
        status: 'failed',
        lastRun: { ...summary().lastRun!, status: 'failed', failureReason: 'Limit exceeded' },
      }),
      now,
    )
    expect(withReason).toMatchObject({ state: 'failed', headline: 'Incremental check failed' })
    expect(withReason?.lastCheck).toBe('Limit exceeded')

    const withoutReason = formatHeaderIncrementalStrip(summary({ status: 'failed', lastRun: null }), now)
    expect(withoutReason?.lastCheck).toBe('Retry from Advanced Settings')
  })

  it('renders a needs_reindex strip with no next check', () => {
    const strip = formatHeaderIncrementalStrip(
      summary({ status: 'needs_reindex', nextCheckAt: null, lastRun: null }),
      now,
    )
    expect(strip).toMatchObject({
      state: 'needs_reindex',
      headline: 'Incremental indexing unavailable',
      nextCheck: null,
      lastCheck: 'Re-index once to enable incremental checks',
    })
  })

  it('renders a not_checked strip', () => {
    const strip = formatHeaderIncrementalStrip(
      summary({ status: 'not_checked', lastCheckedAt: null, lastRun: null }),
      now,
    )
    expect(strip?.state).toBe('not_checked')
    expect(strip?.lastChecked).toBeNull()
  })
})
