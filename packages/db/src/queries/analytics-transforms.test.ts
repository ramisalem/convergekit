import { describe, expect, it } from 'vitest'
import {
  enumerateUtcDays,
  successRate,
  topNWithOther,
  windowStart,
  windowToDays,
  zeroFillSeries,
} from './analytics-transforms.js'

describe('windowToDays', () => {
  it('maps window keys to day counts', () => {
    expect(windowToDays('7d')).toBe(7)
    expect(windowToDays('30d')).toBe(30)
    expect(windowToDays('90d')).toBe(90)
  })
})

describe('windowStart', () => {
  it('returns 00:00 UTC of (today - (N-1)) days', () => {
    const now = new Date('2026-06-30T13:24:00.000Z')
    expect(windowStart('7d', now).toISOString()).toBe('2026-06-24T00:00:00.000Z')
    expect(windowStart('30d', now).toISOString()).toBe('2026-06-01T00:00:00.000Z')
  })
})

describe('enumerateUtcDays', () => {
  it('lists every UTC day inclusive of both ends', () => {
    const start = new Date('2026-06-24T00:00:00.000Z')
    const end = new Date('2026-06-30T13:24:00.000Z')
    expect(enumerateUtcDays(start, end)).toEqual([
      '2026-06-24',
      '2026-06-25',
      '2026-06-26',
      '2026-06-27',
      '2026-06-28',
      '2026-06-29',
      '2026-06-30',
    ])
  })
})

describe('zeroFillSeries', () => {
  it('fills missing days with zeros for the requested keys', () => {
    const days = ['2026-06-24', '2026-06-25', '2026-06-26']
    const rows = [{ day: '2026-06-25', count: 5 }]
    expect(zeroFillSeries(days, rows, ['count'])).toEqual([
      { day: '2026-06-24', count: 0 },
      { day: '2026-06-25', count: 5 },
      { day: '2026-06-26', count: 0 },
    ])
  })

  it('supports multiple numeric keys', () => {
    const days = ['2026-06-24', '2026-06-25']
    const rows = [{ day: '2026-06-24', mcp: 100, chat: 2 }]
    expect(zeroFillSeries(days, rows, ['mcp', 'chat'])).toEqual([
      { day: '2026-06-24', mcp: 100, chat: 2 },
      { day: '2026-06-25', mcp: 0, chat: 0 },
    ])
  })
})

describe('topNWithOther', () => {
  it('keeps top N and buckets the remainder into Other', () => {
    const rows = [
      { label: 'a', count: 10 },
      { label: 'b', count: 8 },
      { label: 'c', count: 3 },
      { label: 'd', count: 1 },
    ]
    expect(topNWithOther(rows, 2)).toEqual([
      { label: 'a', count: 10 },
      { label: 'b', count: 8 },
      { label: 'Other', count: 4 },
    ])
  })

  it('adds no Other bucket when rows fit within N', () => {
    const rows = [{ label: 'a', count: 10 }]
    expect(topNWithOther(rows, 5)).toEqual([{ label: 'a', count: 10 }])
  })
})

describe('successRate', () => {
  it('divides success by total', () => {
    expect(successRate({ success: 9, failure: 1, rate_limited: 0 })).toBe(0.9)
  })

  it('returns null when there is no traffic', () => {
    expect(successRate({ success: 0, failure: 0, rate_limited: 0 })).toBeNull()
  })
})
