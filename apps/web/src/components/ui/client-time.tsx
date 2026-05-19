'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

type TimeStyle = 'date' | 'dateTime' | 'relative'

function formatRelative(date: Date) {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000)
  const ranges: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ]
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  for (const [unit, unitSeconds] of ranges) {
    if (Math.abs(seconds) >= unitSeconds) {
      return formatter.format(Math.round(seconds / unitSeconds), unit)
    }
  }
  return formatter.format(seconds, 'second')
}

export function ClientTime({
  iso,
  style = 'date',
  fallback = null,
}: {
  iso: string | null | undefined
  style?: TimeStyle
  fallback?: ReactNode
}) {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    if (!iso) {
      setLabel(null)
      return
    }

    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) {
      setLabel(null)
      return
    }

    if (style === 'relative') {
      setLabel(formatRelative(date))
      return
    }

    setLabel(
      new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        ...(style === 'dateTime' && { hour: '2-digit', minute: '2-digit' }),
      }).format(date),
    )
  }, [iso, style])

  if (!iso) return fallback
  return <time dateTime={iso}>{label ?? iso}</time>
}
