export type IncrementalIndexingSummary = {
  enabled: boolean
  status:
    | 'not_checked'
    | 'active'
    | 'fresh'
    | 'changes_indexed'
    | 'failed'
    | 'paused'
    | 'needs_reindex'
  lastCheckedAt: string | null
  nextCheckAt: string | null
  activeRun: {
    id: string
    jobId: string | null
    status: 'checking' | 'queued' | 'processing'
    startedAt: string | null
  } | null
  lastRun: {
    id: string
    status: 'completed' | 'completed_noop' | 'failed' | 'skipped'
    trigger: 'scheduled' | 'manual' | 'full_reindex'
    fromCommit: string | null
    toCommit: string | null
    changedFileCount: number
    deletedFileCount: number
    skippedFileCount: number
    chunkCount: number
    failureReason: string | null
    finishedAt: string | null
  } | null
}

function relativePast(iso: string | null, now: Date): string | null {
  if (!iso) return null
  const diffMs = now.getTime() - new Date(iso).getTime()
  if (diffMs < 0) return 'just now'
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function relativeFuture(iso: string | null, now: Date): string | null {
  if (!iso) return null
  const diffMs = new Date(iso).getTime() - now.getTime()
  // Already elapsed (clock skew, or a pause→resume that shifted the schedule):
  // suppress rather than render a misleading "soon" for a past timestamp.
  if (diffMs <= 0) return null
  const minutes = Math.ceil(diffMs / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  return `${hours}h`
}

function changeSummary(lastRun: IncrementalIndexingSummary['lastRun']): string {
  if (!lastRun) return 'no changes'
  if (lastRun.changedFileCount === 0) return 'no changes'
  const n = lastRun.changedFileCount
  return `${n} ${n === 1 ? 'file' : 'files'} changed`
}

/**
 * Compact, text-forward freshness line for repository rows. Returns null when
 * there is no summary so callers can omit the line on older cached records.
 */
export function formatRepositoryListFreshnessLine(
  summary: IncrementalIndexingSummary | null | undefined,
  now: Date,
): string | null {
  if (!summary) return null
  const checked = relativePast(summary.lastCheckedAt, now)
  const next = relativeFuture(summary.nextCheckAt, now)

  if (summary.status === 'needs_reindex') {
    return 'Re-index once to enable incremental checks'
  }
  if (summary.status === 'paused') {
    return checked ? `Automatic checks paused · Last checked ${checked}` : 'Automatic checks paused'
  }
  if (summary.status === 'failed') {
    const reason = summary.lastRun?.failureReason ?? 'Retry from Advanced Settings'
    return `Last check failed · ${reason}`
  }
  if (summary.status === 'active') {
    return next ? `Checking now · Next check in ${next}` : 'Checking now'
  }
  if (summary.status === 'not_checked' || !checked) {
    return next ? `Not checked yet · Next check in ${next}` : 'Not checked yet'
  }
  const parts = [`Last checked ${checked}`]
  if (next) parts.push(`Next check in ${next}`)
  parts.push(`Last check: ${changeSummary(summary.lastRun)}`)
  return parts.join(' · ')
}

export type HeaderStrip = {
  state: 'active' | 'paused' | 'failed' | 'fresh' | 'not_checked' | 'needs_reindex'
  headline: string
  lastChecked: string | null
  nextCheck: string | null
  lastCheck: string
}

/** Structured parts for the read-only repository-detail header strip. */
export function formatHeaderIncrementalStrip(
  summary: IncrementalIndexingSummary | null | undefined,
  now: Date,
): HeaderStrip | null {
  if (!summary) return null
  const headline =
    summary.status === 'paused'
      ? 'Incremental indexing paused'
      : summary.status === 'failed'
        ? 'Incremental check failed'
        : summary.status === 'needs_reindex'
          ? 'Incremental indexing unavailable'
          : 'Incremental indexing active'
  const state =
    summary.status === 'paused'
      ? 'paused'
      : summary.status === 'failed'
        ? 'failed'
        : summary.status === 'active'
          ? 'active'
          : summary.status === 'needs_reindex'
            ? 'needs_reindex'
            : summary.status === 'not_checked'
              ? 'not_checked'
              : 'fresh'
  const lastCheck =
    summary.status === 'failed'
      ? (summary.lastRun?.failureReason ?? 'Retry from Advanced Settings')
      : summary.status === 'needs_reindex'
        ? 'Re-index once to enable incremental checks'
        : changeSummary(summary.lastRun)
  return {
    state,
    headline,
    lastChecked: relativePast(summary.lastCheckedAt, now),
    nextCheck:
      summary.status === 'paused' || summary.status === 'needs_reindex'
        ? null
        : relativeFuture(summary.nextCheckAt, now),
    lastCheck,
  }
}
