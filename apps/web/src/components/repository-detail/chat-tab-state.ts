export type ChatMainPaneState = 'loading' | 'session-load-error' | 'view'

export interface ChatMainPaneStateInput {
  activeSessionError: string | null
  activeSessionId: string | null
  loadingSession: boolean
  loadingSessions: boolean
  repositoryStateReady: boolean
  sessionsInitialized: boolean
}

export function getChatMainPaneState({
  activeSessionError,
  activeSessionId,
  loadingSession,
  repositoryStateReady,
  sessionsInitialized,
}: ChatMainPaneStateInput): ChatMainPaneState {
  if (!repositoryStateReady || (!sessionsInitialized && !activeSessionId)) {
    return 'loading'
  }

  if (loadingSession) {
    return 'loading'
  }

  if (activeSessionId && activeSessionError) {
    return 'session-load-error'
  }

  return 'view'
}

export function isCurrentChatRepository(currentRepositoryId: string, eventRepositoryId: string) {
  return currentRepositoryId === eventRepositoryId
}
