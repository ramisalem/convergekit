import type { NextRequest } from 'next/server'
import { getApiBaseUrl } from '../../../lib/runtime-urls'
import { buildUpstreamChatPayload } from './payload'

const API_URL = getApiBaseUrl()

function buildResponseHeaders(
  upstream: Response,
  fallbackContentType: string,
  defaults: Record<string, string> = {},
): Headers {
  const headers = new Headers(upstream.headers)

  if (!headers.has('content-type')) {
    headers.set('Content-Type', fallbackContentType)
  }

  for (const [name, value] of Object.entries(defaults)) {
    if (!headers.has(name)) {
      headers.set(name, value)
    }
  }

  return headers
}

export async function GET(req: NextRequest) {
  const upstream = await fetch(`${API_URL}/api/chat${req.nextUrl.search}`, {
    method: 'GET',
    headers: {
      Cookie: req.headers.get('cookie') ?? '',
    },
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: buildResponseHeaders(upstream, 'application/json'),
  })
}

/**
 * Proxy for the Vercel AI SDK useChat hook.
 *
 * useChat sends:  { messages: [...], sessionId, repositoryId }
 * Our API wants:  { sessionId, repositoryId, message: string }
 *
 * We extract the last user message and forward it, then pipe the
 * Vercel AI SDK UI message stream response straight back to the client.
 */
export async function POST(req: NextRequest) {
  let payload: ReturnType<typeof buildUpstreamChatPayload>
  try {
    payload = buildUpstreamChatPayload(await req.json())
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid chat request'
    return new Response(JSON.stringify({ error: message }), { status: 400 })
  }

  const upstream = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: req.headers.get('cookie') ?? '',
    },
    body: JSON.stringify(payload),
  })

  if (!upstream.ok) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: buildResponseHeaders(upstream, 'application/json'),
    })
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: buildResponseHeaders(upstream, 'text/event-stream', {
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Vercel-AI-UI-Message-Stream': 'v1',
    }),
  })
}
