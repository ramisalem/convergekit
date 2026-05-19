export type ChatMessagePart = {
  type?: string
  text?: unknown
}

export type ChatMessage = {
  role: string
  content?: unknown
  parts?: ChatMessagePart[]
}

export type ChatRequestBody = {
  messages?: ChatMessage[]
  sessionId?: unknown
  repositoryId?: unknown
  message?: unknown
}

export function getLatestUserMessageText(messages: ChatMessage[] = []): string | null {
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
  if (!lastUserMessage) return null

  if (typeof lastUserMessage.content === 'string' && lastUserMessage.content.trim()) {
    return lastUserMessage.content.trim()
  }

  const textFromParts = lastUserMessage.parts
    ?.filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('')
    .trim()

  return textFromParts || null
}

export function buildUpstreamChatPayload(body: ChatRequestBody) {
  if (typeof body.sessionId !== 'string' || typeof body.repositoryId !== 'string') {
    throw new Error('Missing chat session or repository')
  }

  const message =
    typeof body.message === 'string' && body.message.trim()
      ? body.message.trim()
      : getLatestUserMessageText(body.messages)

  if (!message) {
    throw new Error('No user message')
  }

  return {
    sessionId: body.sessionId,
    repositoryId: body.repositoryId,
    message,
  }
}
