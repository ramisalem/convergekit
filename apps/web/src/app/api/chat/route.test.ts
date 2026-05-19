import type { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GET, POST } from './route'
import { buildUpstreamChatPayload, getLatestUserMessageText } from './payload'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('chat route payload normalization', () => {
  it('extracts the latest user message from AI SDK text parts', () => {
    expect(
      getLatestUserMessageText([
        {
          role: 'user',
          content: '',
          parts: [{ type: 'text', text: 'What does this repository do?' }],
        },
      ]),
    ).toBe('What does this repository do?')
  })

  it('builds the backend payload from either a direct message or AI SDK messages', () => {
    expect(
      buildUpstreamChatPayload({
        sessionId: '00000000-0000-0000-0000-000000000001',
        repositoryId: '00000000-0000-0000-0000-000000000002',
        messages: [
          { role: 'assistant', content: 'Hello' },
          {
            role: 'user',
            content: '',
            parts: [{ type: 'text', text: 'Explain the folder structure.' }],
          },
        ],
      }),
    ).toEqual({
      sessionId: '00000000-0000-0000-0000-000000000001',
      repositoryId: '00000000-0000-0000-0000-000000000002',
      message: 'Explain the folder structure.',
    })

    expect(
      buildUpstreamChatPayload({
        sessionId: '00000000-0000-0000-0000-000000000001',
        repositoryId: '00000000-0000-0000-0000-000000000002',
        message: 'What does this repository do?',
      }),
    ).toEqual({
      sessionId: '00000000-0000-0000-0000-000000000001',
      repositoryId: '00000000-0000-0000-0000-000000000002',
      message: 'What does this repository do?',
    })
  })
})

describe('chat route proxy surface', () => {
  it('proxies GET history requests to the backend with cookies and upstream response metadata', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ sessions: [] }), {
        status: 207,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const response = await GET({
      nextUrl: new URL('http://localhost/api/chat?repositoryId=repo-1'),
      headers: new Headers({ cookie: 'session=abc' }),
    } as unknown as NextRequest)

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4001/api/chat?repositoryId=repo-1', {
      method: 'GET',
      headers: {
        Cookie: 'session=abc',
      },
    })
    expect(response.status).toBe(207)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(await response.json()).toEqual({ sessions: [] })
  })

  it('normalizes AI SDK POST payloads before proxying chat streams', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('stream', {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Vercel-AI-UI-Message-Stream': 'v1',
        },
      }),
    )

    const response = await POST({
      json: async () => ({
        sessionId: '00000000-0000-0000-0000-000000000001',
        repositoryId: '00000000-0000-0000-0000-000000000002',
        messages: [
          { role: 'assistant', content: 'Hello' },
          {
            role: 'user',
            content: '',
            parts: [{ type: 'text', text: 'Explain the folder structure.' }],
          },
        ],
      }),
      headers: new Headers({ cookie: 'session=abc' }),
    } as unknown as NextRequest)

    const [, init] = fetchMock.mock.calls[0]
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4001/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'session=abc',
        },
      }),
    )
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      sessionId: '00000000-0000-0000-0000-000000000001',
      repositoryId: '00000000-0000-0000-0000-000000000002',
      message: 'Explain the folder structure.',
    })
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(response.headers.get('cache-control')).toBe('no-cache')
    expect(response.headers.get('x-vercel-ai-ui-message-stream')).toBe('v1')
    expect(response.headers.get('x-vercel-ai-data-stream')).toBeNull()
  })
})
