import { z } from 'zod'

const chatMessagePartSchema = z.object({
  type: z.string().optional(),
  text: z.unknown().optional(),
})

const chatMessageSchema = z.object({
  role: z.string(),
  content: z.unknown().optional(),
  parts: z.array(chatMessagePartSchema).optional(),
})

const chatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  repositoryId: z.string().uuid(),
  message: z.unknown().optional(),
  messages: z.array(chatMessageSchema).optional(),
})

const normalizedChatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  repositoryId: z.string().uuid(),
  message: z.string().min(1).max(8000),
})

export function getLatestUserMessageText(messages: z.infer<typeof chatMessageSchema>[] = []) {
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

export function parseChatRequestBody(body: unknown) {
  const parsed = chatRequestSchema.parse(body)
  const message =
    typeof parsed.message === 'string' && parsed.message.trim()
      ? parsed.message.trim()
      : getLatestUserMessageText(parsed.messages)

  return normalizedChatRequestSchema.parse({
    sessionId: parsed.sessionId,
    repositoryId: parsed.repositoryId,
    message,
  })
}
