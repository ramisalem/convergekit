import { describe, expect, it } from 'vitest'

import { getChatMainPaneState, isCurrentChatRepository } from './chat-tab-state'

describe('chat-tab-state', () => {
  it('keeps the main pane in the initial loading state before sessions initialize', () => {
    expect(
      getChatMainPaneState({
        activeSessionError: null,
        activeSessionId: null,
        loadingSession: false,
        loadingSessions: false,
        repositoryStateReady: true,
        sessionsInitialized: false,
      }),
    ).toBe('loading')
  })

  it('shows a selected-session error instead of the chat view after hydration fails', () => {
    expect(
      getChatMainPaneState({
        activeSessionError: 'Failed to start chat session. Please refresh.',
        activeSessionId: 'session-1',
        loadingSession: false,
        loadingSessions: false,
        repositoryStateReady: true,
        sessionsInitialized: true,
      }),
    ).toBe('session-load-error')
  })

  it('lets retry loading take precedence over an existing selected-session error', () => {
    expect(
      getChatMainPaneState({
        activeSessionError: 'Failed to start chat session. Please refresh.',
        activeSessionId: 'session-1',
        loadingSession: true,
        loadingSessions: false,
        repositoryStateReady: true,
        sessionsInitialized: true,
      }),
    ).toBe('loading')
  })

  it('rejects stale repository callbacks after navigation', () => {
    expect(isCurrentChatRepository('repo-2', 'repo-1')).toBe(false)
    expect(isCurrentChatRepository('repo-2', 'repo-2')).toBe(true)
  })
})
