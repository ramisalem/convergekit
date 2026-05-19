'use client'

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtItem,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
} from '@/components/ai-elements/chain-of-thought'
import { ToolInput, ToolOutput, getStatusBadge } from '@/components/ai-elements/tool'
import type { UIMessage } from 'ai'
import { SearchIcon, WrenchIcon } from 'lucide-react'
import {
  getActivityParts,
  getActivityStepDefaultOpen,
  getActivityStepKey,
  getReasoningText,
  getToolParts,
  type ChatActivityPart,
} from './chat-message-activity'

export {
  getActivityParts,
  getMessageContent,
  getReasoningText,
  getToolParts,
} from './chat-message-activity'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasDisplayValue(value: unknown) {
  if (value === undefined) {
    return false
  }

  if (isRecord(value)) {
    return Object.keys(value).length > 0
  }

  return true
}

type ChatMessagePartProps = {
  message: UIMessage
  isStreaming?: boolean
}

type VisualActivityStep =
  | {
      id: string
      type: 'reasoning'
      text: string
    }
  | {
      id: string
      type: 'tool'
      tool: Extract<ChatActivityPart, { type: 'tool' }>['tool']
    }

function getActivityTextSteps(text: string) {
  return text
    .split(/\n+/)
    .map((step) => step.trim())
    .filter(Boolean)
}

function getVisualActivitySteps(parts: ChatActivityPart[]): VisualActivityStep[] {
  return parts.flatMap((part): VisualActivityStep[] => {
    if (part.type === 'reasoning') {
      return getActivityTextSteps(part.text).map((text, index) => ({
        id: `${part.id}-step-${index}`,
        type: 'reasoning',
        text,
      }))
    }

    return [{ id: part.id, type: 'tool', tool: part.tool }]
  })
}

function getActivityTimelineDefaultOpen(parts: ChatActivityPart[], isStreaming: boolean) {
  return parts.some((part) => getActivityStepDefaultOpen(part, isStreaming))
}

function getActivityTimelineKey(parts: ChatActivityPart[], isStreaming: boolean) {
  return [
    'search-agent-activity',
    ...parts.map((part) => getActivityStepKey(part, isStreaming)),
  ].join('|')
}

function ActivityStepItem({
  isLast,
  step,
  stepNumber,
}: {
  isLast: boolean
  step: VisualActivityStep
  stepNumber: number
}) {
  return (
    <div className="relative pl-9">
      {!isLast ? (
        <span className="absolute top-7 bottom-[-0.75rem] left-3 w-px bg-border/70" />
      ) : null}
      <span
        aria-label={`Step ${stepNumber}`}
        className="absolute top-0 left-0 z-10 flex size-6 items-center justify-center rounded-full border border-border bg-background text-[0.7rem] font-semibold text-muted-foreground shadow-sm"
      >
        {stepNumber}
      </span>

      {step.type === 'reasoning' ? (
        <ChainOfThoughtItem className="rounded-md border border-border/60 bg-background/85 p-3 text-xs leading-6 whitespace-pre-wrap">
          {step.text}
        </ChainOfThoughtItem>
      ) : (
        <div className="rounded-md border border-border/60 bg-background/85 p-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex min-w-0 items-center gap-2">
              <WrenchIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono text-xs font-semibold">{step.tool.toolName}</span>
            </span>
            {getStatusBadge(step.tool.state)}
          </div>
          <details className="group/tool mt-3">
            <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              View tool details
            </summary>
            <div className="mt-3 space-y-3">
              {hasDisplayValue(step.tool.input) ? <ToolInput input={step.tool.input} /> : null}
              <ToolOutput errorText={step.tool.errorText} output={step.tool.output} />
              {step.tool.toolCallId ? (
                <ChainOfThoughtItem className="border-t border-border/60 pt-2 font-mono text-[0.7rem]">
                  Call ID: {step.tool.toolCallId}
                </ChainOfThoughtItem>
              ) : null}
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

function ActivityStepList({ steps }: { steps: VisualActivityStep[] }) {
  return (
    <div className="space-y-3">
      {steps.map((step, index) => (
        <ActivityStepItem
          key={step.id}
          isLast={index === steps.length - 1}
          step={step}
          stepNumber={index + 1}
        />
      ))}
    </div>
  )
}

function ChatActivityTimeline({
  parts,
  isStreaming,
}: {
  parts: ChatActivityPart[]
  isStreaming: boolean
}) {
  if (parts.length === 0) {
    return null
  }
  const steps = getVisualActivitySteps(parts)

  return (
    <ChainOfThought className="chat-activity w-full rounded-md border border-border/70 bg-muted/20 p-3">
      <ChainOfThoughtStep
        key={getActivityTimelineKey(parts, isStreaming)}
        defaultOpen={getActivityTimelineDefaultOpen(parts, isStreaming)}
      >
        <ChainOfThoughtTrigger
          className="w-full"
          leftIcon={<SearchIcon className="size-4" />}
          swapIconOnHover={false}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className="font-medium">Search Agent Activity</span>
            {isStreaming ? (
              <span className="text-xs font-normal text-muted-foreground">Working...</span>
            ) : null}
          </span>
        </ChainOfThoughtTrigger>
        <ChainOfThoughtContent>
          <ActivityStepList steps={steps} />
        </ChainOfThoughtContent>
      </ChainOfThoughtStep>
    </ChainOfThought>
  )
}

export function ChatActivity({ message, isStreaming = false }: ChatMessagePartProps) {
  return <ChatActivityTimeline isStreaming={isStreaming} parts={getActivityParts(message)} />
}

export function ChatReasoning({ message, isStreaming = false }: ChatMessagePartProps) {
  const reasoning = getReasoningText(message)

  if (!reasoning) {
    return null
  }

  return (
    <ChatActivityTimeline
      isStreaming={isStreaming}
      parts={[{ id: 'reasoning', type: 'reasoning', text: reasoning }]}
    />
  )
}

export function ChatTools({ message }: ChatMessagePartProps) {
  const tools = getToolParts(message)

  if (tools.length === 0) {
    return null
  }

  return (
    <ChatActivityTimeline
      isStreaming={false}
      parts={tools.map((tool, index) => ({
        id: tool.toolCallId ?? `tool-${tool.toolName}-${index}`,
        type: 'tool',
        tool,
      }))}
    />
  )
}
