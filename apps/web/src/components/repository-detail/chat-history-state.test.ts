import { describe, expect, it } from 'vitest'

import {
  getSessionTitle,
  mergeChatActivityParts,
  sortChatSessions,
  toInitialChatMessages,
} from './chat-history-state'
import { getActivityParts, getMessageContent } from './chat-message-activity'

describe('chat-history-state', () => {
  it('falls back to an untitled label when a session title is missing', () => {
    expect(getSessionTitle({ title: null, createdAt: '2026-04-28T10:00:00.000Z' })).toBe(
      'Untitled chat',
    )
  })

  it('sorts sessions by newest update first', () => {
    expect(
      sortChatSessions([
        { id: 'older', updatedAt: '2026-04-28T10:00:00.000Z' },
        { id: 'newer', updatedAt: '2026-04-28T11:00:00.000Z' },
      ]).map((session) => session.id),
    ).toEqual(['newer', 'older'])
  })

  it('converts persisted messages to useChat initial messages', () => {
    expect(
      toInitialChatMessages([
        { id: 'm1', role: 'user', content: 'Hello' },
        { id: 'm2', role: 'assistant', content: 'Hi there' },
      ]),
    ).toEqual([
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
      { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'Hi there' }] },
    ])
  })

  it('preserves streamed assistant activity when refreshed history is text-only', () => {
    const refreshedMessages = toInitialChatMessages([
      { id: 'saved-user', role: 'user', content: 'What happens when we index a repo?' },
      {
        id: 'saved-assistant',
        role: 'assistant',
        content: '## Repository Indexing Process\n\nThe answer starts here.',
      },
    ])
    const streamedMessages = [
      {
        id: 'local-user',
        role: 'user',
        parts: [{ type: 'text', text: 'What happens when we index a repo?' }],
      },
      {
        id: 'local-assistant',
        role: 'assistant',
        parts: [
          { type: 'text', text: "I'll search the indexed docs for repository indexing." },
          {
            type: 'tool-invocation',
            toolInvocation: {
              state: 'result',
              toolCallId: 'call-1',
              toolName: 'searchDocs',
              args: { query: 'repository indexing process' },
              result: { count: 5 },
            },
          },
          {
            type: 'text',
            text: '## Repository Indexing Process\n\nThe answer starts here.',
          },
        ],
      },
    ] as Parameters<typeof mergeChatActivityParts>[1]

    const merged = mergeChatActivityParts(refreshedMessages, streamedMessages)

    expect(getMessageContent(merged[1])).toBe(
      '## Repository Indexing Process\n\nThe answer starts here.',
    )
    expect(getActivityParts(merged[1])).toMatchObject([
      {
        type: 'reasoning',
        text: "I'll search the indexed docs for repository indexing.",
      },
      {
        type: 'tool',
        tool: {
          toolName: 'searchDocs',
          input: { query: 'repository indexing process' },
          output: { count: 5 },
          state: 'output-available',
        },
      },
    ])
  })
})
