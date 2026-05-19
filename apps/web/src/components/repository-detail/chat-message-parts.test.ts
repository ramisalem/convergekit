import type { UIMessage } from 'ai'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/ai-elements/chain-of-thought', () => ({
  ChainOfThought: () => null,
  ChainOfThoughtContent: () => null,
  ChainOfThoughtItem: () => null,
  ChainOfThoughtStep: () => null,
  ChainOfThoughtTrigger: () => null,
}))

vi.mock('@/components/ai-elements/tool', () => ({
  ToolInput: () => null,
  ToolOutput: () => null,
  getStatusBadge: () => null,
}))

const { getActivityParts, getReasoningText, getToolParts } = await import('./chat-message-activity')

function message(parts: UIMessage['parts']): UIMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: '',
    parts,
  }
}

function toolMessage(toolInvocation: Record<string, unknown>) {
  return message([
    {
      type: 'tool-invocation',
      toolInvocation,
    },
  ] as UIMessage['parts'])
}

describe('chat-message-parts', () => {
  it('extracts reasoning from AI SDK v4 reasoning parts', () => {
    expect(
      getReasoningText(
        message([
          {
            type: 'reasoning',
            reasoning: '  Look up the repository context.  ',
            details: [],
          },
        ]),
      ),
    ).toBe('Look up the repository context.')
  })

  it('orders reasoning and tool calls as prompt-kit activity steps', () => {
    expect(
      getActivityParts(
        message([
          {
            type: 'reasoning',
            reasoning: '  Inspect repository metadata.  ',
            details: [],
          },
          {
            type: 'tool-invocation',
            toolInvocation: {
              state: 'result',
              toolCallId: 'call-1',
              toolName: 'searchDocs',
              args: { query: 'auth' },
              result: { count: 3 },
            },
          },
        ] as UIMessage['parts']),
      ),
    ).toMatchObject([
      {
        type: 'reasoning',
        text: 'Inspect repository metadata.',
      },
      {
        type: 'tool',
        tool: {
          state: 'output-available',
          toolCallId: 'call-1',
          toolName: 'searchDocs',
          input: { query: 'auth' },
          output: { count: 3 },
        },
      },
    ])
  })

  it('maps partial tool calls to input streaming', () => {
    expect(
      getToolParts(
        toolMessage({
          state: 'partial-call',
          toolCallId: 'call-1',
          toolName: 'searchDocs',
          args: { query: 'auth' },
        }),
      ),
    ).toMatchObject([
      {
        state: 'input-streaming',
        toolCallId: 'call-1',
        toolName: 'searchDocs',
        input: { query: 'auth' },
        output: undefined,
        errorText: undefined,
      },
    ])
  })

  it.each([false, 0, ''])(
    'maps falsy result output %j to output available and preserves the output',
    (output) => {
      expect(
        getToolParts(
          toolMessage({
            state: 'result',
            toolCallId: 'call-1',
            toolName: 'readFile',
            args: { path: 'README.md' },
            result: output,
          }),
        ),
      ).toMatchObject([
        {
          state: 'output-available',
          output,
          errorText: undefined,
        },
      ])
    },
  )

  it.each([false, 0, ''])('does not treat result.error %j as a tool error', (error) => {
    expect(
      getToolParts(
        toolMessage({
          state: 'result',
          toolCallId: 'call-1',
          toolName: 'getStructure',
          args: {},
          result: { error, ok: true },
        }),
      ),
    ).toMatchObject([
      {
        state: 'output-available',
        output: { error, ok: true },
        errorText: undefined,
      },
    ])
  })
})
