'use client'

import { analyticsApi } from '@/lib/api-client'
import type {
  AnalyticsWindow,
  HealthResponse,
  KpiResponse,
  UtilizationResponse,
} from '@convergekit/types'
import { useCallback, useEffect, useState } from 'react'
import { HealthSection } from './health-section'
import { KpiStrip } from './kpi-strip'
import { UtilizationSection } from './utilization-section'

const WINDOWS: AnalyticsWindow[] = ['7d', '30d', '90d']

// Module-scope loaders so their identity is stable across renders. Inline arrow
// wrappers would be re-created every render, churning the useCallback/useEffect
// below into an infinite refetch loop.
const loadKpis = (w: AnalyticsWindow) => analyticsApi.kpis(w)
const loadHealth = (w: AnalyticsWindow) => analyticsApi.health(w)
const loadUtilization = (w: AnalyticsWindow) => analyticsApi.utilization(w)

/** Generic per-section async state so one failed fetch never blanks the page. */
function useSection<T>(load: (w: AnalyticsWindow) => Promise<T>, window: AnalyticsWindow) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const run = useCallback(() => {
    setLoading(true)
    setError(null)
    load(window)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [load, window])

  useEffect(run, [run])
  return { data, error, loading, reload: run }
}

export function AnalyticsDashboard() {
  const [window, setWindow] = useState<AnalyticsWindow>('30d')

  const kpis = useSection<KpiResponse>(loadKpis, window)
  const health = useSection<HealthResponse>(loadHealth, window)
  const utilization = useSection<UtilizationResponse>(loadUtilization, window)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Utilization</h1>
        <div className="flex gap-1 rounded-md border border-neutral-200 p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`rounded px-3 py-1 text-sm ${
                window === w ? 'bg-foreground text-background' : 'text-neutral-500'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </header>

      <SectionFrame title="Overview" state={kpis}>
        {(data) => <KpiStrip data={data} />}
      </SectionFrame>

      <SectionFrame title="Health" state={health}>
        {(data) => <HealthSection data={data} />}
      </SectionFrame>

      <SectionFrame title="Utilization" state={utilization}>
        {(data) => <UtilizationSection data={data} />}
      </SectionFrame>
    </div>
  )
}

/** Renders loading / error (with retry) / data states for a section. */
export function SectionFrame<T>({
  title,
  state,
  children,
}: {
  title: string
  state: { data: T | null; error: string | null; loading: boolean; reload: () => void }
  children: (data: T) => React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button
          onClick={state.reload}
          className="text-xs text-neutral-500 hover:text-neutral-900"
        >
          Refresh
        </button>
      </div>
      {state.loading ? (
        <div className="h-24 animate-pulse rounded-lg bg-neutral-100" />
      ) : state.error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {state.error}{' '}
          <button onClick={state.reload} className="underline">
            Retry
          </button>
        </div>
      ) : state.data ? (
        children(state.data)
      ) : null}
    </div>
  )
}
