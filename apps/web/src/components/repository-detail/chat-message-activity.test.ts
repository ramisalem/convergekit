import type { UIMessage } from 'ai'
import { describe, expect, it } from 'vitest'
import {
  formatActivityText,
  getActivityParts,
  getActivityStepDefaultOpen,
  getMessageContent,
  getToolParts,
} from './chat-message-activity'

function message(parts: UIMessage['parts']): UIMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    parts,
  }
}

function toolInvocation(toolInvocation: Record<string, unknown>) {
  return {
    type: 'tool-invocation',
    toolInvocation,
  } as unknown as UIMessage['parts'][number]
}

describe('chat-message-activity', () => {
  it('keeps assistant search chatter collapsed out of the final answer', () => {
    const chatMessage = message([
      { type: 'text', text: "I'll search the indexed docs for the chat flow." },
      toolInvocation({
        state: 'result',
        toolCallId: 'call-1',
        toolName: 'searchDocs',
        args: { query: 'chat search flow' },
        result: { count: 3 },
      }),
      {
        type: 'text',
        text: 'Perfect! I found the relevant pieces.\n\n## What happens in chat\n\nThe answer starts here.',
      },
    ] as UIMessage['parts'])

    expect(getMessageContent(chatMessage)).toBe(
      '## What happens in chat\n\nThe answer starts here.',
    )
    expect(getActivityParts(chatMessage)).toMatchObject([
      {
        type: 'reasoning',
        text: "I'll search the indexed docs for the chat flow.",
      },
      {
        type: 'tool',
        tool: {
          toolName: 'searchDocs',
          input: { query: 'chat search flow' },
          output: { count: 3 },
          state: 'output-available',
        },
      },
      {
        type: 'reasoning',
        text: 'Perfect! I found the relevant pieces.',
      },
    ])
  })

  it('recovers activity preambles from persisted text-only assistant messages', () => {
    const chatMessage = message([
      {
        type: 'text',
        text: "I'll search for information about how chat works.Perfect! I have comprehensive information.\n\n# What Happens\n\nFinal answer.",
      },
    ] as UIMessage['parts'])

    expect(getMessageContent(chatMessage)).toBe('# What Happens\n\nFinal answer.')
    expect(getActivityParts(chatMessage)).toMatchObject([
      {
        type: 'reasoning',
        text: "I'll search for information about how chat works.\nPerfect! I have comprehensive information.",
      },
    ])
  })

  it('separates common search-agent narration transitions into distinct lines', () => {
    expect(
      formatActivityText(
        "I'll search for billing details. Let me search the workflow. Now let me inspect the structure. Perfect! I found the pieces.",
      ),
    ).toBe(
      "I'll search for billing details.\nLet me search the workflow.\nNow let me inspect the structure.\nPerfect! I found the pieces.",
    )
  })

  it('extracts reasoning and legacy tool-invocation parts across AI SDK shapes', () => {
    const chatMessage = message([
      {
        type: 'reasoning',
        reasoning: '  Inspect repository metadata.  ',
        details: [],
      },
      toolInvocation({
        state: 'partial-call',
        toolCallId: 'call-2',
        toolName: 'readFile',
        args: { path: 'apps/api/src/routes/chat.ts' },
      }),
    ] as unknown as UIMessage['parts'])

    expect(getActivityParts(chatMessage)).toMatchObject([
      {
        type: 'reasoning',
        text: 'Inspect repository metadata.',
      },
      {
        type: 'tool',
        tool: {
          state: 'input-streaming',
          toolCallId: 'call-2',
          toolName: 'readFile',
          input: { path: 'apps/api/src/routes/chat.ts' },
        },
      },
    ])
    expect(getToolParts(chatMessage)).toMatchObject([
      {
        state: 'input-streaming',
        toolName: 'readFile',
      },
    ])
  })

  it('collapses completed activity steps and keeps active/error steps expanded', () => {
    expect(
      getActivityStepDefaultOpen(
        {
          id: 'tool-1',
          type: 'tool',
          tool: {
            toolName: 'searchDocs',
            input: {},
            output: {},
            errorText: undefined,
            state: 'output-available',
          },
        },
        false,
      ),
    ).toBe(false)

    expect(
      getActivityStepDefaultOpen(
        {
          id: 'tool-1',
          type: 'tool',
          tool: {
            toolName: 'searchDocs',
            input: {},
            output: undefined,
            errorText: 'failed',
            state: 'output-error',
          },
        },
        false,
      ),
    ).toBe(true)

    expect(
      getActivityStepDefaultOpen(
        {
          id: 'reasoning-1',
          type: 'reasoning',
          text: 'Thinking...',
        },
        true,
      ),
    ).toBe(true)
  })
})
