import type { ChatMessage, ChatSession } from '@/lib/api-client'
import type { UIMessage } from 'ai'
import { getActivityParts, getMessageContent, type ChatActivityPart } from './chat-message-activity'

export function getSessionTitle(session: Pick<ChatSession, 'title' | 'createdAt'>) {
  return session.title?.trim() || 'Untitled chat'
}

export function sortChatSessions<T extends Pick<ChatSession, 'updatedAt'>>(sessions: T[]) {
  return [...sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
}

export function toInitialChatMessages(messages: Pick<ChatMessage, 'id' | 'role' | 'content'>[]) {
  return messages.map(
    (message): UIMessage => ({
      id: message.id,
      role: message.role,
      parts: [{ type: 'text', text: message.content }],
    }),
  )
}

function getAssistantOrdinal(messages: UIMessage[], targetIndex: number) {
  return messages.slice(0, targetIndex + 1).filter((message) => message.role === 'assistant').length
}

function getActivityContentPart(activity: ChatActivityPart): UIMessage['parts'][number] {
  if (activity.type === 'reasoning') {
    return { type: 'reasoning', text: activity.text } as UIMessage['parts'][number]
  }

  return {
    type: `tool-${activity.tool.toolName}`,
    toolCallId: activity.tool.toolCallId,
    state: activity.tool.state,
    input: activity.tool.input,
    output: activity.tool.output,
    errorText: activity.tool.errorText,
  } as UIMessage['parts'][number]
}

function getActivitySourceMessages(messages: UIMessage[]) {
  return messages.flatMap((message, index) => {
    if (message.role !== 'assistant') {
      return []
    }

    const activityParts = getActivityParts(message)
    if (activityParts.length === 0) {
      return []
    }

    return [
      {
        activityParts,
        content: getMessageContent(message),
        id: message.id,
        ordinal: getAssistantOrdinal(messages, index),
      },
    ]
  })
}

function contentLooksRelated(sourceContent: string, targetContent: string) {
  const source = sourceContent.trim()
  const target = targetContent.trim()

  if (!source || !target) {
    return true
  }

  return source === target || source.startsWith(target) || target.startsWith(source)
}

export function mergeChatActivityParts(
  nextMessages: UIMessage[],
  activitySourceMessages: UIMessage[],
) {
  const activitySources = getActivitySourceMessages(activitySourceMessages)
  if (activitySources.length === 0) {
    return nextMessages
  }

  let changed = false
  const mergedMessages = nextMessages.map((message, index): UIMessage => {
    if (message.role !== 'assistant' || getActivityParts(message).length > 0) {
      return message
    }

    const content = getMessageContent(message)
    const ordinal = getAssistantOrdinal(nextMessages, index)
    const source =
      activitySources.find((candidate) => candidate.id === message.id) ??
      activitySources.find(
        (candidate) =>
          candidate.ordinal === ordinal && contentLooksRelated(candidate.content, content),
      )

    if (!source) {
      return message
    }

    changed = true

    return {
      ...message,
      parts: [
        ...source.activityParts.map(getActivityContentPart),
        { type: 'text', text: content } as UIMessage['parts'][number],
      ],
    }
  })

  return changed ? mergedMessages : nextMessages
}
