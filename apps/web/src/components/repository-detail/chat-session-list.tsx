'use client'

import type { ChatSession } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { MessageSquarePlus, Trash2 } from 'lucide-react'
import { getSessionTitle } from './chat-history-state'

type Props = {
  sessions: ChatSession[]
  activeSessionId: string | null
  loading?: boolean
  error?: string | null
  onNewChat: () => void
  onSelectSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
}

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatSessionWhen(updatedAt: string) {
  const updatedDate = new Date(updatedAt)

  if (Number.isNaN(updatedDate.getTime())) {
    return ''
  }

  const now = new Date()
  const ageMs = now.getTime() - updatedDate.getTime()
  const hourMs = 60 * 60 * 1000
  const dayMs = 24 * hourMs

  if (ageMs < hourMs) {
    return 'now'
  }

  if (ageMs < dayMs) {
    return `${Math.max(1, Math.floor(ageMs / hourMs))}h`
  }

  if (ageMs < 2 * dayMs) {
    return 'yesterday'
  }

  if (ageMs < 7 * dayMs) {
    return weekdayLabels[updatedDate.getDay()]
  }

  return `${monthLabels[updatedDate.getMonth()]} ${updatedDate.getDate()}`
}

export function ChatSessionList({
  sessions,
  activeSessionId,
  loading = false,
  error = null,
  onNewChat,
  onSelectSession,
  onDeleteSession,
}: Props) {
  return (
    <aside className="chat-session-rail flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-[var(--convergekit-line)] bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--convergekit-line-2)] px-3.5 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.02em] text-[var(--convergekit-ink-2)]">
          Sessions
        </p>
        <button
          type="button"
          onClick={onNewChat}
          className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-md border border-[var(--convergekit-line)] text-[var(--convergekit-ink-3)] transition-colors hover:bg-[var(--convergekit-bg-3)] hover:text-[var(--convergekit-ink)]"
          aria-label="New chat"
          title="New chat"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
        </button>
      </div>

      {error ? <p className="mx-3.5 mt-3 text-xs text-destructive">{error}</p> : null}
      {loading ? (
        <p className="mx-3.5 mt-3 text-xs text-[var(--convergekit-ink-4)]">Loading chats...</p>
      ) : null}

      {!loading && !error && sessions.length === 0 ? (
        <p className="mx-3.5 mt-3 rounded-md border border-dashed border-[var(--convergekit-line)] bg-[var(--convergekit-bg-2)] px-3 py-3 text-xs text-[var(--convergekit-ink-4)]">
          No conversations yet
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {sessions.map((session) => {
          const title = getSessionTitle(session)
          const when = formatSessionWhen(session.updatedAt)
          const messageCount =
            typeof session.messageCount === 'number'
              ? `${session.messageCount} ${session.messageCount === 1 ? 'message' : 'messages'}`
              : null

          return (
            <div
              key={session.id}
              className={cn(
                'group flex min-w-0 items-start gap-2 border-b border-[var(--convergekit-line-2)] border-l-2 px-3.5 py-2.5 text-left transition-colors',
                session.id === activeSessionId
                  ? 'border-l-[var(--convergekit-ink)] bg-[var(--convergekit-bg-3)] text-[var(--convergekit-ink)]'
                  : 'border-l-transparent text-[var(--convergekit-ink-3)] hover:bg-[var(--convergekit-bg-2)] hover:text-[var(--convergekit-ink)]',
              )}
            >
              <button
                type="button"
                onClick={() => onSelectSession(session.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="line-clamp-2 text-[12.5px] font-semibold leading-[1.35] text-[var(--convergekit-ink)]">
                  {title}
                </span>
                {messageCount || when ? (
                  <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[var(--convergekit-ink-4)]">
                    <span>{messageCount}</span>
                    <span className="shrink-0">{when}</span>
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => onDeleteSession(session.id)}
                className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-[var(--convergekit-ink-4)] opacity-70 transition hover:bg-white hover:text-destructive focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                aria-label={`Delete ${title}`}
                title="Delete chat"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
