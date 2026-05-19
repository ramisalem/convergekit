import type { ToolPart as AIToolPart } from '@/components/ai-elements/tool'
import type { UIMessage } from 'ai'

type GeneratedToolState = AIToolPart['state']

export type ChatToolPart = {
  toolCallId?: string
  toolName: string
  input: unknown
  output: unknown
  errorText: string | undefined
  state: GeneratedToolState
}

export type ChatActivityPart =
  | {
      id: string
      type: 'reasoning'
      text: string
    }
  | {
      id: string
      type: 'tool'
      tool: ChatToolPart
    }

const GENERATED_TOOL_STATES = new Set<GeneratedToolState>([
  'approval-requested',
  'approval-responded',
  'input-available',
  'input-streaming',
  'output-available',
  'output-denied',
  'output-error',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function readField(record: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    if (hasOwn(record, field)) {
      return record[field]
    }
  }

  return undefined
}

function getErrorMessage(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value === 'string') {
    return value.trim() ? value : undefined
  }

  if (value instanceof Error) {
    return value.message.trim() ? value.message : undefined
  }

  if (isRecord(value) && typeof value.message === 'string' && value.message.trim()) {
    return value.message
  }

  return undefined
}

function getToolErrorText(invocation: Record<string, unknown>) {
  const result = invocation.result

  return (
    getErrorMessage(invocation.errorText) ??
    getErrorMessage(invocation.error) ??
    getErrorMessage(isRecord(result) ? result.error : undefined)
  )
}

function getToolName(invocation: Record<string, unknown>) {
  if (typeof invocation.toolName === 'string') {
    return invocation.toolName
  }

  if (typeof invocation.type === 'string' && invocation.type.startsWith('tool-')) {
    return invocation.type.slice('tool-'.length)
  }

  return 'tool'
}

function getToolInvocationRecord(part: unknown): Record<string, unknown> | null {
  if (isRecord(part) && part.type === 'tool-invocation' && isRecord(part.toolInvocation)) {
    return part.toolInvocation
  }

  return isRecord(part) &&
    typeof part.type === 'string' &&
    (part.type.startsWith('tool-') || part.type === 'dynamic-tool')
    ? part
    : null
}

function isGeneratedToolState(state: unknown): state is GeneratedToolState {
  return typeof state === 'string' && GENERATED_TOOL_STATES.has(state as GeneratedToolState)
}

function mapToolState(
  state: unknown,
  output: unknown,
  errorText: string | undefined,
): GeneratedToolState {
  if (errorText) {
    return 'output-error'
  }

  if (isGeneratedToolState(state)) {
    return state
  }

  if (state === 'result' || state === 'completed' || state === 'complete') {
    return 'output-available'
  }

  if (state === 'partial-call' || state === 'input-streaming' || state === 'streaming') {
    return 'input-streaming'
  }

  if (
    state === 'call' ||
    state === 'input-available' ||
    state === 'in-progress' ||
    state === 'in_progress' ||
    state === 'running'
  ) {
    return 'input-available'
  }

  if (state === 'error' || state === 'failed') {
    return 'output-error'
  }

  return output === undefined ? 'input-available' : 'output-available'
}

function getToolPartFromInvocation(invocation: Record<string, unknown>): ChatToolPart {
  const toolName = getToolName(invocation)
  const input = readField(invocation, ['args', 'input']) ?? {}
  const output = readField(invocation, ['result', 'output'])
  const errorText = getToolErrorText(invocation)

  return {
    toolCallId: typeof invocation.toolCallId === 'string' ? invocation.toolCallId : undefined,
    toolName,
    input,
    output,
    errorText,
    state: mapToolState(invocation.state, output, errorText),
  }
}

export function getMessageContent(message: UIMessage) {
  const { content } = splitMessageActivity(message)
  return content
}

export function getReasoningText(message: UIMessage) {
  const reasoningParts = getActivityParts(message)
    .filter(
      (part): part is Extract<ChatActivityPart, { type: 'reasoning' }> => part.type === 'reasoning',
    )
    .map((part) => part.text)

  if (reasoningParts.length > 0) {
    return reasoningParts.join('\n\n')
  }

  return ''
}

export function getToolParts(message: UIMessage): ChatToolPart[] {
  return (message.parts ?? []).flatMap((part) => {
    const invocation = getToolInvocationRecord(part)
    if (!invocation) {
      return []
    }

    return [getToolPartFromInvocation(invocation)]
  })
}

export function getActivityParts(message: UIMessage): ChatActivityPart[] {
  const { activityParts } = splitMessageActivity(message)
  return activityParts
}

function getTextPartText(part: unknown) {
  if (!isRecord(part) || part.type !== 'text') return ''
  return typeof part.text === 'string' ? part.text : ''
}

function getReasoningPartText(part: unknown) {
  if (!isRecord(part) || part.type !== 'reasoning') return ''
  const text = readField(part, ['text', 'reasoning'])
  return typeof text === 'string' ? text.trim() : ''
}

function buildTextActivityPart(text: string, index: number): ChatActivityPart[] {
  const formatted = formatActivityText(text)
  return formatted ? [{ id: `text-activity-${index}`, type: 'reasoning', text: formatted }] : []
}

function splitPersistedActivityContent(text: string) {
  const trimmedStart = text.trimStart()
  const leadingWhitespace = text.slice(0, text.length - trimmedStart.length)

  if (!/^(i['’]?ll\b|i will\b|let me\b|perfect\s*!|sure\s*[,!]?\b|i found\b)/i.test(trimmedStart)) {
    return { activityText: '', content: text }
  }

  const headingMatch = /\n{1,}(#{1,6}\s+\S[\s\S]*)/.exec(trimmedStart)
  if (!headingMatch?.index) {
    return { activityText: '', content: text }
  }

  return {
    activityText: formatActivityText(trimmedStart.slice(0, headingMatch.index)),
    content: `${leadingWhitespace}${headingMatch[1].trimStart()}`,
  }
}

export function formatActivityText(text: string) {
  return text
    .trim()
    .replace(/([.!?])\s*(?=(?:i['’]?ll|i will|let me|now|next|then|perfect)\b)/gi, '$1\n')
    .replace(/\n{3,}/g, '\n\n')
}

function splitMessageActivity(message: UIMessage): {
  activityParts: ChatActivityPart[]
  content: string
} {
  const parts = message.parts ?? []
  const textPartIndexes = parts
    .map((part, index) => ({ index, text: getTextPartText(part) }))
    .filter((part) => part.text.length > 0)
  const lastTextPartIndex = textPartIndexes.at(-1)?.index ?? -1
  const hasStructuredActivity = parts.some(
    (part) => (isRecord(part) && part.type === 'reasoning') || getToolInvocationRecord(part),
  )

  const activityParts: ChatActivityPart[] = []
  const contentParts: string[] = []

  parts.forEach((part, index) => {
    const text = getTextPartText(part)

    if (text) {
      if (message.role === 'assistant' && (hasStructuredActivity || textPartIndexes.length > 1)) {
        if (index === lastTextPartIndex) {
          const split = splitPersistedActivityContent(text)
          activityParts.push(...buildTextActivityPart(split.activityText, index))
          if (split.content.trim()) contentParts.push(split.content)
          return
        }

        activityParts.push(...buildTextActivityPart(text, index))
        return
      }

      if (message.role === 'assistant') {
        const split = splitPersistedActivityContent(text)
        activityParts.push(...buildTextActivityPart(split.activityText, index))
        contentParts.push(split.content)
        return
      }

      contentParts.push(text)
      return
    }

    const reasoningText = getReasoningPartText(part)
    if (reasoningText) {
      activityParts.push({ id: `reasoning-${index}`, type: 'reasoning', text: reasoningText })
      return
    }

    const invocation = getToolInvocationRecord(part)
    if (invocation) {
      const tool = getToolPartFromInvocation(invocation)

      activityParts.push({
        id: tool.toolCallId ?? `tool-${tool.toolName}-${index}`,
        type: 'tool',
        tool,
      })
    }
  })

  return { activityParts, content: contentParts.join('') }
}

export function getActivityStepDefaultOpen(part: ChatActivityPart, isStreaming: boolean) {
  if (part.type === 'reasoning') {
    return isStreaming
  }

  return part.tool.state !== 'output-available'
}

export function getActivityStepKey(part: ChatActivityPart, isStreaming: boolean) {
  const state = part.type === 'tool' ? part.tool.state : 'reasoning'
  return `${part.id}-${isStreaming ? 'streaming' : 'settled'}-${state}`
}
