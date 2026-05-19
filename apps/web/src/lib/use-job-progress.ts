import { useEffect, useRef, useState } from 'react'
import { getApiBaseUrl } from '@/lib/runtime-urls'

export type JobProgressStatus = 'processing' | 'completed' | 'failed' | 'stalled'

export interface JobProgress {
  progress: number
  status: JobProgressStatus
  error?: string
}

const STALL_TIMEOUT_MS = 30_000

/**
 * Opens an EventSource to the SSE notification proxy and drives a progress
 * bar from BullMQ job events. Auto-closes the source on terminal events.
 * Falls back to "stalled" if no event arrives within STALL_TIMEOUT_MS.
 *
 * @param jobId  - BullMQ job ID (null/undefined = no-op)
 * @param queue  - BullMQ queue name (e.g. 'repository-analysis')
 */
export function useJobProgress(
  jobId: string | null | undefined,
  queue: string,
): JobProgress {
  const [state, setState] = useState<JobProgress>({ progress: 0, status: 'processing' })
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!jobId) return

    const API_URL = getApiBaseUrl()
    const url = `${API_URL}/api/notifications/jobs/${encodeURIComponent(jobId)}?queue=${encodeURIComponent(queue)}`
    const es = new EventSource(url, { withCredentials: true })
    esRef.current = es

    // If no event arrives within the timeout, mark as stalled
    const stallTimer = setTimeout(() => {
      setState((prev) => {
        if (prev.status === 'processing') {
          return { ...prev, status: 'stalled' }
        }
        return prev
      })
    }, STALL_TIMEOUT_MS)

    function resetStallTimer() {
      clearTimeout(stallTimer)
    }

    es.addEventListener('progress', (e) => {
      resetStallTimer()
      const data = JSON.parse(e.data)
      setState((prev) => ({ ...prev, progress: Number(data.progress ?? data.data ?? data), status: 'processing' }))
    })

    es.addEventListener('completed', () => {
      resetStallTimer()
      setState({ progress: 100, status: 'completed' })
      es.close()
    })

    es.addEventListener('failed', (e) => {
      resetStallTimer()
      const data = JSON.parse(e.data)
      setState((prev) => ({
        ...prev,
        status: 'failed',
        error: String(data.failedReason ?? 'Unknown error'),
      }))
      es.close()
    })

    return () => {
      clearTimeout(stallTimer)
      es.close()
      esRef.current = null
    }
  }, [jobId, queue])

  return state
}
