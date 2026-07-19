// Pure, dependency-free analytics helpers. MUST NOT import the db client so the
// unit tests can run without a DATABASE_URL (matches the package test convention).

import type { AnalyticsWindow } from '@convergekit/types'

export type { AnalyticsWindow }

export function windowToDays(window: AnalyticsWindow): number {
  switch (window) {
    case '7d':
      return 7
    case '30d':
      return 30
    case '90d':
      return 90
  }
}

/** 00:00 UTC of (today - (N-1) days), so the series has exactly N calendar buckets. */
export function windowStart(window: AnalyticsWindow, now: Date): Date {
  const days = windowToDays(window)
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  start.setUTCDate(start.getUTCDate() - (days - 1))
  return start
}

/** Inclusive list of YYYY-MM-DD UTC day strings between start and end. */
export function enumerateUtcDays(start: Date, end: Date): string[] {
  const days: string[] = []
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))
  while (cursor <= last) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

/** Merge sparse daily rows onto a continuous day list, zero-filling the given keys. */
export function zeroFillSeries<K extends string>(
  days: string[],
  rows: Array<{ day: string } & Record<K, number>>,
  keys: readonly K[],
): Array<{ day: string } & Record<K, number>> {
  const byDay = new Map(rows.map((r) => [r.day, r]))
  return days.map((day) => {
    const existing = byDay.get(day)
    const filled: Record<string, number | string> = { day }
    for (const key of keys) {
      filled[key] = existing ? (existing[key] ?? 0) : 0
    }
    return filled as { day: string } & Record<K, number>
  })
}

/** Sort desc, keep top N, sum the remainder into a single "Other" bucket. */
export function topNWithOther(
  rows: Array<{ label: string; count: number }>,
  n: number,
): Array<{ label: string; count: number }> {
  const sorted = [...rows].sort((a, b) => b.count - a.count)
  const top = sorted.slice(0, n).map((r) => ({ label: r.label, count: r.count }))
  const rest = sorted.slice(n)
  if (rest.length > 0) {
    top.push({ label: 'Other', count: rest.reduce((sum, r) => sum + r.count, 0) })
  }
  return top
}

export function successRate(counts: {
  success: number
  failure: number
  rate_limited: number
}): number | null {
  const total = counts.success + counts.failure + counts.rate_limited
  if (total === 0) return null
  return counts.success / total
}
