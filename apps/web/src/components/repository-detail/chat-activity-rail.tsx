'use client'

import { cn } from '@/lib/utils'
import { Code2, FileCode2, Sparkles } from 'lucide-react'
import type { CodeReference } from './chat-code-references'
import type { ChatActivityPart } from './chat-message-activity'

export type ChatActivitySnapshot = {
  activityParts: ChatActivityPart[]
  isStreaming: boolean
  sources: CodeReference[]
  toolCount: number
}

type ActivityRailItem = {
  detail: string
  id: string
  kind: 'reasoning' | 'source' | 'tool'
  meta: string[]
  tier: 'A' | 'B' | 'C' | 'D' | null
  title: string
}

export const EMPTY_CHAT_ACTIVITY_SNAPSHOT: ChatActivitySnapshot = {
  activityParts: [],
  isStreaming: false,
  sources: [],
  toolCount: 0,
}

const tierDotClassName = {
  A: 'bg-[var(--convergekit-auth-a-bd)]',
  B: 'bg-[var(--convergekit-auth-b-bd)]',
  C: 'bg-[var(--convergekit-auth-c-bd)]',
  D: 'bg-[var(--convergekit-auth-d-bd)]',
} satisfies Record<NonNullable<ActivityRailItem['tier']>, string>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringifyScalar(value: unknown) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

function readField(record: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = record[field]
    const scalar = stringifyScalar(value)

    if (scalar?.trim()) {
      return scalar
    }
  }

  return null
}

function compactJson(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function summarizeToolInput(input: unknown) {
  if (isRecord(input)) {
    const focused =
      readField(input, ['query', 'q', 'path', 'file', 'glob', 'pattern', 'repositoryPath']) ??
      compactJson(input)

    return focused ?? 'Prepared input'
  }

  return stringifyScalar(input) ?? 'Prepared input'
}

function getCollectionCount(value: unknown): number | null {
  if (Array.isArray(value)) return value.length

  if (!isRecord(value)) return null

  const directCount = value.count ?? value.total
  if (typeof directCount === 'number') return directCount

  for (const key of ['results', 'docs', 'chunks', 'files', 'items']) {
    const child = value[key]
    if (Array.isArray(child)) {
      return child.length
    }
  }

  return null
}

function getToolHitCount(output: unknown) {
  const count = getCollectionCount(output)
  return count === null ? null : `${count} hits`
}

function getToolTier(toolName: string): ActivityRailItem['tier'] {
  const normalized = toolName.toLowerCase()

  if (normalized.includes('test')) return 'B'
  if (normalized.includes('doc') || normalized.includes('wiki')) return 'C'
  if (normalized.includes('adr') || normalized.includes('decision')) return 'D'
  return 'A'
}

function formatToolState(state: string) {
  return state
    .replaceAll('-', ' ')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function truncateDetail(detail: string) {
  return detail.length > 120 ? `${detail.slice(0, 117)}...` : detail
}

export function buildChatActivityRailItems(snapshot: ChatActivitySnapshot): ActivityRailItem[] {
  const activityItems = snapshot.activityParts.map<ActivityRailItem>((part, index) => {
    if (part.type === 'reasoning') {
      return {
        detail: truncateDetail(part.text.replaceAll(/\s+/g, ' ').trim() || 'Synthesize answer'),
        id: part.id,
        kind: 'reasoning',
        meta: snapshot.isStreaming && index === snapshot.activityParts.length - 1 ? ['working'] : [],
        tier: null,
        title: 'reasoning',
      }
    }

    const hitCount = getToolHitCount(part.tool.output)
    const meta = [hitCount, formatToolState(part.tool.state)].filter(
      (value): value is string => Boolean(value),
    )

    return {
      detail: truncateDetail(summarizeToolInput(part.tool.input)),
      id: part.id,
      kind: 'tool',
      meta,
      tier: getToolTier(part.tool.toolName),
      title: part.tool.toolName,
    }
  })

  if (activityItems.length > 0) {
    return activityItems
  }

  return snapshot.sources.slice(0, 5).map((source) => ({
    detail: source.lineRange ? `lines ${source.lineRange}` : source.reference,
    id: source.reference,
    kind: 'source',
    meta: ['source'],
    tier: 'A',
    title: source.path,
  }))
}

function ActivityIcon({ kind }: { kind: ActivityRailItem['kind'] }) {
  if (kind === 'reasoning') {
    return <Sparkles className="h-3 w-3" />
  }

  if (kind === 'source') {
    return <FileCode2 className="h-3 w-3" />
  }

  return <Code2 className="h-3 w-3" />
}

export function ChatActivityRail({ snapshot }: { snapshot: ChatActivitySnapshot }) {
  const items = buildChatActivityRailItems(snapshot)
  const toolLabel = `${snapshot.toolCount} ${snapshot.toolCount === 1 ? 'tool' : 'tools'}`
  const statusLabel = snapshot.isStreaming ? 'working' : items.length > 0 ? 'ready' : 'idle'

  return (
    <aside className="chat-activity-rail flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-l border-[var(--convergekit-line)] bg-white">
      <div className="border-b border-[var(--convergekit-line-2)] px-3.5 py-3">
        <div className="text-xs font-semibold uppercase tracking-[0.02em] text-[var(--convergekit-ink-2)]">
          Search agent activity
        </div>
        <div className="mt-0.5 text-[11px] text-[var(--convergekit-ink-4)]">
          {toolLabel} · {statusLabel}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3.5 py-3">
        {items.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center">
            <p className="text-xs leading-5 text-[var(--convergekit-ink-4)]">
              Activity appears here as Colab Ai Hub searches the indexed codebase.
            </p>
          </div>
        ) : (
          items.map((item, index) => (
            <div key={`${item.kind}-${item.id}-${index}`} className="flex min-w-0 gap-2.5">
              <div className="flex w-4 shrink-0 flex-col items-center pt-0.5">
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    item.tier ? tierDotClassName[item.tier] : 'bg-[var(--convergekit-ink-4)]',
                  )}
                />
                {index < items.length - 1 ? (
                  <span className="mt-1 w-px flex-1 bg-[var(--convergekit-line)]" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1 pb-2">
                <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-[var(--convergekit-ink)]">
                  <ActivityIcon kind={item.kind} />
                  <span className="truncate font-mono">{item.title}</span>
                </div>
                <div className="mt-0.5 truncate text-[11.5px] text-[var(--convergekit-ink-3)]">
                  {item.detail}
                </div>
                {item.meta.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10.5px] text-[var(--convergekit-ink-4)]">
                    {item.meta.map((meta) => (
                      <span key={meta}>{meta}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
