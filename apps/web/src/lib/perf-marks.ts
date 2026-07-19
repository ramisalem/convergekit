export type PerfMark =
  | 'repositories:list:start'
  | 'repositories:list:paint-cached'
  | 'repositories:list:fresh'
  | 'repository-detail:mount'
  | 'repository-detail:paint-cached'
  | 'repository-detail:fresh'

/** Dev-only `performance.mark`. Never throws and never runs in production. */
export function markPerf(name: PerfMark): void {
  if (process.env.NODE_ENV === 'production') return
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return
  try {
    performance.mark(name)
  } catch {
    // Instrumentation must never break the app.
  }
}
