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
    <aside className="flex min-h-0 shrink-0 flex-col border-b border-border bg-muted/20 p-3 md:h-full md:w-72 md:border-b-0 md:border-r">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Conversations
        </p>
        <button
          type="button"
          onClick={onNewChat}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="New chat"
          title="New chat"
        >
          <MessageSquarePlus className="h-4 w-4" />
        </button>
      </div>

      {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
      {loading ? <p className="mt-3 text-xs text-muted-foreground">Loading chats...</p> : null}

      {!loading && !error && sessions.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-border bg-background/70 px-3 py-3 text-xs text-muted-foreground">
          No conversations yet
        </p>
      ) : null}

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 md:min-h-0 md:flex-1 md:flex-col md:overflow-x-hidden md:overflow-y-auto md:pb-0">
        {sessions.map((session) => {
          const title = getSessionTitle(session)
          const messageCount =
            typeof session.messageCount === 'number'
              ? `${session.messageCount} ${session.messageCount === 1 ? 'message' : 'messages'}`
              : null

          return (
            <div
              key={session.id}
              className={cn(
                'group flex min-w-56 items-start gap-2 rounded-md border px-3 py-2.5 text-left transition-colors md:min-w-0',
                session.id === activeSessionId
                  ? 'border-border bg-background text-foreground shadow-sm'
                  : 'border-transparent text-muted-foreground hover:border-border hover:bg-background/70 hover:text-foreground',
              )}
            >
              <button
                type="button"
                onClick={() => onSelectSession(session.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm font-medium">{title}</span>
                {messageCount ? (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {messageCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => onDeleteSession(session.id)}
                className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-muted-foreground opacity-70 transition hover:bg-background hover:text-destructive focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
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
