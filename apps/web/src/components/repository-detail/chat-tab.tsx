'use client'

import { chatApi, type ChatMessage, type ChatSession } from '@/lib/api-client'
import { trackRepositoryDetailEvent } from '@/lib/repository-analytics'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChatActivityRail,
  EMPTY_CHAT_ACTIVITY_SNAPSHOT,
  type ChatActivitySnapshot,
} from './chat-activity-rail'
import { sortChatSessions } from './chat-history-state'
import { ChatSessionList } from './chat-session-list'
import { ChatSessionView } from './chat-session-view'
import { getChatMainPaneState, isCurrentChatRepository } from './chat-tab-state'

interface Props {
  repositoryId: string
  compatibility?: {
    compatible: boolean
    message: string | null
  } | null
  embeddingProfile?: {
    model: string
    dimensions: number
  } | null
}

function LoadingSession() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

function SessionLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center p-6 text-center">
      <p className="text-sm text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-md border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        Retry
      </button>
    </div>
  )
}

export function ChatTab({ repositoryId, compatibility, embeddingProfile }: Props) {
  const t = useTranslations('repositoryDetail.chat')
  const [stateRepositoryId, setStateRepositoryId] = useState(repositoryId)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [loadingSession, setLoadingSession] = useState(false)
  const [sessionsInitialized, setSessionsInitialized] = useState(false)
  const [activeSessionError, setActiveSessionError] = useState<string | null>(null)
  const [sessionLoadRetryKey, setSessionLoadRetryKey] = useState(0)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [activitySnapshot, setActivitySnapshot] = useState<ChatActivitySnapshot>(
    EMPTY_CHAT_ACTIVITY_SNAPSHOT,
  )
  const listRequestId = useRef(0)
  const newChatSelected = useRef(false)
  const currentRepositoryId = useRef(repositoryId)
  const chatBlocked = compatibility ? !compatibility.compatible : false
  currentRepositoryId.current = repositoryId

  const refreshSessions = useCallback(
    async (targetRepositoryId = repositoryId) => {
      if (!isCurrentChatRepository(currentRepositoryId.current, targetRepositoryId)) {
        return
      }

      if (chatBlocked) {
        listRequestId.current += 1
        setLoadingSessions(false)
        return
      }

      const requestId = listRequestId.current + 1
      listRequestId.current = requestId
      setLoadingSessions(true)
      setSessionError(null)

      try {
        const response = await chatApi.listSessions(targetRepositoryId)

        if (
          requestId !== listRequestId.current ||
          !isCurrentChatRepository(currentRepositoryId.current, targetRepositoryId)
        ) {
          return
        }

        const sorted = sortChatSessions(response.sessions)
        setSessions(sorted)
        setSessionsInitialized(true)
        setActiveSessionId((current) => {
          const newestSessionId = sorted[0]?.id ?? null

          if (current && sorted.some((session) => session.id === current)) {
            return current
          }

          return newChatSelected.current ? null : newestSessionId
        })
      } catch {
        if (
          requestId === listRequestId.current &&
          isCurrentChatRepository(currentRepositoryId.current, targetRepositoryId)
        ) {
          setSessionsInitialized(true)
          setSessionError(t('sessionError'))
        }
      } finally {
        if (
          requestId === listRequestId.current &&
          isCurrentChatRepository(currentRepositoryId.current, targetRepositoryId)
        ) {
          setLoadingSessions(false)
        }
      }
    },
    [chatBlocked, repositoryId, t],
  )

  useEffect(() => {
    listRequestId.current += 1
    newChatSelected.current = false
    setStateRepositoryId(repositoryId)
    setSessions([])
    setSessionsInitialized(false)
    setActiveSessionId(null)
    setInitialMessages([])
    setLoadingSession(false)
    setActiveSessionError(null)
    setSessionError(null)
    setActivitySnapshot(EMPTY_CHAT_ACTIVITY_SNAPSHOT)
  }, [repositoryId])

  useEffect(() => {
    void refreshSessions()
  }, [refreshSessions])

  useEffect(() => {
    let cancelled = false

    if (stateRepositoryId !== repositoryId) {
      setInitialMessages([])
      setLoadingSession(false)
      setActiveSessionError(null)
      return () => {
        cancelled = true
      }
    }

    if (!activeSessionId) {
      setInitialMessages([])
      setLoadingSession(false)
      setActiveSessionError(null)
      return () => {
        cancelled = true
      }
    }

    setInitialMessages([])
    setLoadingSession(true)
    setActiveSessionError(null)

    chatApi
      .getSession(repositoryId, activeSessionId)
      .then(({ messages }) => {
        if (!cancelled) {
          setInitialMessages(messages)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActiveSessionError(t('sessionError'))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingSession(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeSessionId, repositoryId, sessionLoadRetryKey, stateRepositoryId, t])

  const handleNewChat = useCallback(() => {
    trackRepositoryDetailEvent({
      name: 'repository_chat_start',
      repositoryId,
      tab: 'chat',
    })
    newChatSelected.current = true
    setActiveSessionId(null)
    setInitialMessages([])
    setLoadingSession(false)
    setActiveSessionError(null)
    setSessionError(null)
    setActivitySnapshot(EMPTY_CHAT_ACTIVITY_SNAPSHOT)
  }, [repositoryId])

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      newChatSelected.current = false

      if (sessionId === activeSessionId) {
        if (activeSessionError) {
          setActiveSessionError(null)
          setLoadingSession(true)
          setSessionLoadRetryKey((current) => current + 1)
        }

        return
      }

      setActiveSessionError(null)
      setActiveSessionId(sessionId)
      setInitialMessages([])
      setLoadingSession(true)
      setActivitySnapshot(EMPTY_CHAT_ACTIVITY_SNAPSHOT)
    },
    [activeSessionError, activeSessionId],
  )

  const handleSessionCreated = useCallback((eventRepositoryId: string, sessionId: string) => {
    if (!isCurrentChatRepository(currentRepositoryId.current, eventRepositoryId)) {
      return
    }

    newChatSelected.current = false
    setActiveSessionId(sessionId)
    setInitialMessages([])
    setActiveSessionError(null)
    setActivitySnapshot(EMPTY_CHAT_ACTIVITY_SNAPSHOT)
  }, [])

  const handleSessionUpdated = useCallback(
    (eventRepositoryId: string) => {
      if (!isCurrentChatRepository(currentRepositoryId.current, eventRepositoryId)) {
        return
      }

      void refreshSessions(eventRepositoryId)
    },
    [refreshSessions],
  )

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      setSessionError(null)
      const targetRepositoryId = repositoryId

      try {
        await chatApi.deleteSession(targetRepositoryId, sessionId)

        if (!isCurrentChatRepository(currentRepositoryId.current, targetRepositoryId)) {
          return
        }

        const remainingSessions = sortChatSessions(
          sessions.filter((session) => session.id !== sessionId),
        )

        setSessions(remainingSessions)

        if (activeSessionId === sessionId) {
          newChatSelected.current = false
          setActiveSessionId(remainingSessions[0]?.id ?? null)
          setInitialMessages([])
          setActiveSessionError(null)
          setActivitySnapshot(EMPTY_CHAT_ACTIVITY_SNAPSHOT)
        }

        void refreshSessions(targetRepositoryId)
      } catch {
        if (isCurrentChatRepository(currentRepositoryId.current, targetRepositoryId)) {
          setSessionError(t('sessionError'))
        }
      }
    },
    [activeSessionId, refreshSessions, repositoryId, sessions, t],
  )

  const handleRetrySessionLoad = useCallback(() => {
    setActiveSessionError(null)
    setLoadingSession(true)
    setSessionLoadRetryKey((current) => current + 1)
  }, [])

  if (chatBlocked) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm font-semibold text-amber-700">
          Chat is unavailable for this repository.
        </p>
        <p className="mt-2 max-w-md text-sm text-neutral-500">{compatibility?.message}</p>
        {embeddingProfile && (
          <p className="mt-2 text-xs text-neutral-400">
            Indexed profile: {embeddingProfile.model} ({embeddingProfile.dimensions} dims)
          </p>
        )}
      </div>
    )
  }

  const repositoryStateReady = stateRepositoryId === repositoryId
  const visibleSessions = repositoryStateReady ? sessions : []
  const visibleActiveSessionId = repositoryStateReady ? activeSessionId : null
  const visibleInitialMessages = repositoryStateReady ? initialMessages : []
  const visibleLoadingSessions = repositoryStateReady
    ? loadingSessions || !sessionsInitialized
    : true
  const visibleLoadingSession = repositoryStateReady ? loadingSession : false
  const visibleSessionsInitialized = repositoryStateReady ? sessionsInitialized : false
  const visibleActiveSessionError = repositoryStateReady ? activeSessionError : null
  const visibleSessionError = repositoryStateReady ? sessionError : null
  const mainPaneState = getChatMainPaneState({
    activeSessionError: visibleActiveSessionError,
    activeSessionId: visibleActiveSessionId,
    loadingSession: visibleLoadingSession,
    loadingSessions: visibleLoadingSessions,
    repositoryStateReady,
    sessionsInitialized: visibleSessionsInitialized,
  })

  const mainPane =
    mainPaneState === 'loading' ? (
      <LoadingSession />
    ) : mainPaneState === 'session-load-error' ? (
      <SessionLoadError
        message={visibleActiveSessionError ?? t('sessionError')}
        onRetry={handleRetrySessionLoad}
      />
    ) : (
      <ChatSessionView
        key={visibleActiveSessionId ?? 'new-chat'}
        activeSessionId={visibleActiveSessionId}
        initialMessages={visibleInitialMessages}
        onSessionCreated={handleSessionCreated}
        onSessionUpdated={handleSessionUpdated}
        onActivitySnapshotChange={setActivitySnapshot}
        repositoryId={repositoryId}
      />
    )

  return (
    <div
      className="chat-pane-grid grid h-[calc(100vh_-_16rem)] min-h-[640px] w-full min-w-0 overflow-hidden border-b border-[var(--convergekit-line)] bg-[var(--convergekit-bg)]"
      style={{ gridTemplateColumns: '260px minmax(0,1fr) 260px' }}
    >
      <ChatSessionList
        activeSessionId={visibleActiveSessionId}
        error={visibleSessionError}
        loading={visibleLoadingSessions}
        onDeleteSession={handleDeleteSession}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
        sessions={visibleSessions}
      />
      <div className="chat-center-column flex h-full min-h-0 min-w-0 justify-center overflow-hidden px-5 py-4">
        <div className="flex h-full min-h-0 w-full overflow-hidden">{mainPane}</div>
      </div>
      <ChatActivityRail snapshot={activitySnapshot} />
    </div>
  )
}
