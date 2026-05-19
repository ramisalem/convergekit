import { getModel } from '@convergekit/ai'
import {
  appendChatMessage,
  classifyRetrievalIntent,
  createChatSession,
  deleteChatSession,
  getAiSettingsForRepo,
  getBoundedChatHistory,
  getChatSession,
  getChatSessionWithMessages,
  listChatSessions,
  searchChunks,
} from '@convergekit/db'
import { stepCountIs, streamText } from 'ai'
import { Hono } from 'hono'
import { z } from 'zod'
import { AppError } from '../errors.js'
import { getStructureTool, readFileTool, searchDocsTool } from '../lib/agent-tools.js'
import {
  getEmbeddingOptionsForProfile,
  getModelOptionsFromAiSettings,
  getRepositoryEmbeddingState,
} from '../lib/embedding-compatibility.js'
import { checkRateLimit } from '../lib/rate-limit.js'
import { assertRepoAccess } from '../lib/scoping.js'
import { logger } from '../logger.js'
import { parseChatRequestBody } from './chat-payload.js'
import { MAX_CHAT_TOTAL_STEPS, prepareChatStep } from './chat-step-policy.js'

export const chatRoutes = new Hono()

// ─── GET /chat — list sessions ───────────────────────────────────────────────

chatRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const query = listSessionsSchema.parse({ repositoryId: c.req.query('repositoryId') })
  await assertRepoAccess(userId, query.repositoryId)

  const sessions = await listChatSessions(userId, query.repositoryId)

  return c.json({
    sessions: sessions.map((session) => ({
      id: session.id,
      repositoryId: session.repositoryId,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    })),
  })
})

// ─── POST /chat/sessions — create a new chat session ─────────────────────────

const createSessionSchema = z.object({
  repositoryId: z.string().uuid(),
})

const listSessionsSchema = z.object({
  repositoryId: z.string().uuid(),
})

const sessionParamsSchema = z.object({
  sessionId: z.string().uuid(),
})

chatRoutes.post('/sessions', async (c) => {
  const userId = c.get('userId')
  const body = createSessionSchema.parse(await c.req.json())
  await assertRepoAccess(userId, body.repositoryId)
  const session = await createChatSession(userId, body.repositoryId)
  return c.json({ session }, 201)
})

chatRoutes.get('/sessions/:sessionId', async (c) => {
  const userId = c.get('userId')
  const { sessionId } = sessionParamsSchema.parse(c.req.param())
  const query = listSessionsSchema.parse({ repositoryId: c.req.query('repositoryId') })
  await assertRepoAccess(userId, query.repositoryId)

  const session = await getChatSessionWithMessages(userId, query.repositoryId, sessionId)
  if (!session) throw new AppError(404, 'Chat session not found', 'CHAT_SESSION_NOT_FOUND')

  return c.json({
    session: {
      id: session.id,
      repositoryId: session.repositoryId,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
    messages: session.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    })),
  })
})

chatRoutes.delete('/sessions/:sessionId', async (c) => {
  const userId = c.get('userId')
  const { sessionId } = sessionParamsSchema.parse(c.req.param())
  const query = listSessionsSchema.parse({ repositoryId: c.req.query('repositoryId') })
  await assertRepoAccess(userId, query.repositoryId)

  const deleted = await deleteChatSession(userId, query.repositoryId, sessionId)
  if (!deleted) throw new AppError(404, 'Chat session not found', 'CHAT_SESSION_NOT_FOUND')

  return c.json({ ok: true })
})

// ─── POST /chat — RAG streaming chat (JDW-44) ────────────────────────────────

chatRoutes.post('/', async (c) => {
  const userId = c.get('userId')
  const body = parseChatRequestBody(await c.req.json())
  const { sessionId, repositoryId, message } = body
  await assertRepoAccess(userId, repositoryId)

  // (1) Per-user rate limit: 20 requests / 60 s sliding window
  const rateLimit = await checkRateLimit(userId, 'chat')
  if (!rateLimit.allowed) {
    c.header('Retry-After', String(rateLimit.retryAfterSeconds))
    return c.json({ error: 'Too Many Requests' }, 429)
  }

  const session = await getChatSession(userId, repositoryId, sessionId)
  if (!session) throw new AppError(404, 'Chat session not found', 'CHAT_SESSION_NOT_FOUND')

  // (2) Use the repository owner's AI settings and stored index profile for retrieval.
  // Assigned users should be able to consume a pre-indexed repository without matching
  // their own embedding settings to the index-time model.
  const aiSettings = await getAiSettingsForRepo(repositoryId)
  const embeddingState = await getRepositoryEmbeddingState(repositoryId, aiSettings)
  const embeddingOptions = getEmbeddingOptionsForProfile(aiSettings, embeddingState.storedProfile)
  const retrievalPolicy = classifyRetrievalIntent(message)

  // (3) Retrieve top-5 context chunks via hybrid search
  const contextChunks = await searchChunks(repositoryId, message, {
    limit: 5,
    embeddingOptions,
    retrievalPolicy,
  })

  // (4) Build system prompt with injected context
  const contextBlock =
    contextChunks.length > 0
      ? contextChunks
          .map(
            (chunk) =>
              `### ${chunk.path}:${chunk.startLine}-${chunk.endLine} (${chunk.chunkType}; ${chunk.evidenceTier}/${chunk.evidenceKind ?? 'unknown'}; ${chunk.evidenceAlignmentStatus ?? 'unverified'})\n\`\`\`\n${chunk.content}\n\`\`\``,
          )
          .join('\n\n')
      : 'No relevant code context found.'

  const systemPrompt = `You are an expert code assistant for a software repository. \
Answer questions about the codebase clearly and accurately. \
When referencing code, cite the file path and line numbers.

Evidence rules:
- Code and tests describe current behavior.
- Docs describe operational guidance.
- Design/History explains rationale only when the user asked for design, plan, why, history, or roadmap.
- If Design/History conflicts with code or appears stale, say so.

## Relevant context retrieved from the codebase:

${contextBlock}

Use the context above when answering. If the answer is not in the context, say so.`

  // (4) Load chat history
  const history = await getBoundedChatHistory(sessionId)
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ]

  // (5) Persist the user message
  await appendChatMessage(sessionId, 'user', message)

  // (6) Stream response — reuse per-user AI settings loaded above
  const modelOptions = getModelOptionsFromAiSettings(aiSettings)
  const model = getModel('chat', modelOptions)
  const result = streamText({
    model,
    system: systemPrompt,
    messages,
    tools: {
      searchDocs: searchDocsTool(repositoryId, embeddingOptions, retrievalPolicy),
      readFile: readFileTool(repositoryId),
      getStructure: getStructureTool(repositoryId),
    },
    prepareStep: prepareChatStep,
    stopWhen: stepCountIs(MAX_CHAT_TOTAL_STEPS),
    onFinish: async ({ text }) => {
      // Persist the assistant reply once streaming completes
      await appendChatMessage(sessionId, 'assistant', text).catch(() => undefined)
    },
  })

  // (7) Return data stream for the Vercel AI SDK frontend
  return result.toUIMessageStreamResponse({
    onError: (error: unknown) => {
      logger.error({ err: error, repositoryId, sessionId, userId }, 'Chat stream failed')
      return 'An error occurred.'
    },
  })
})
