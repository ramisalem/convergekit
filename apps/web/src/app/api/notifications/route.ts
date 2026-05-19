import type { NextRequest } from 'next/server'
import { getApiBaseUrl } from '../../../lib/runtime-urls'

const API_URL = getApiBaseUrl()

/**
 * Proxies the BullMQ job-notification SSE stream from the Hono API.
 * Client connects to /api/notifications?jobId=<id>&queue=<name>
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const jobId = searchParams.get('jobId')
  const queue = searchParams.get('queue')

  if (!jobId || !queue) {
    return new Response('Missing jobId or queue', { status: 400 })
  }

  const upstream = await fetch(
    `${API_URL}/api/notifications/jobs/${jobId}?queue=${encodeURIComponent(queue)}`,
    {
      headers: { Cookie: req.headers.get('cookie') ?? '' },
      // Tell undici/Node fetch not to buffer the body
      // @ts-expect-error -- Next.js node fetch supports this
      duplex: 'half',
    },
  )

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
