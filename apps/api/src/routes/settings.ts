import { decryptApiKey, encryptApiKey, getModel, maskApiKey, probeEmbeddingProfile } from '@convergekit/ai'
import { accessPolicyConfig } from '@convergekit/config/access-policy'
import { getUserAiSettings, upsertUserAiSettings } from '@convergekit/db'
import { generateText } from 'ai'
import { Hono } from 'hono'
import { z } from 'zod'
import { AppError } from '../errors.js'

// Auth/admin enforcement for /api/settings/* is applied in createApp().
// Keep this router middleware-free so route tests can verify response DTOs directly.
export const settingsRoutes = new Hono()

const ENCRYPTION_SECRET = process.env.BETTER_AUTH_SECRET ?? ''

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildAiSettingsResponse(row: Awaited<ReturnType<typeof getUserAiSettings>>) {
  return {
    provider: row?.provider ?? 'lmstudio',
    hasApiKey: !!row?.encryptedApiKey,
    maskedApiKey: row?.encryptedApiKey
      ? maskApiKey(decryptApiKey(row.encryptedApiKey, ENCRYPTION_SECRET))
      : null,
    lmStudioChatModel: row?.lmStudioChatModel ?? null,
    lmStudioMindmapModel: row?.lmStudioMindmapModel ?? null,
    lmStudioEmbeddingModel: row?.lmStudioEmbeddingModel ?? null,
    openrouterChatModel: row?.openrouterChatModel ?? null,
    openrouterMindmapModel: row?.openrouterMindmapModel ?? null,
    openrouterEmbeddingModel: row?.openrouterEmbeddingModel ?? null,
    openrouterEndpoint: row?.openrouterEndpoint ?? null,
    anthropicChatModel: row?.anthropicChatModel ?? null,
    anthropicMindmapModel: row?.anthropicMindmapModel ?? null,
    anthropicEmbeddingModel: row?.anthropicEmbeddingModel ?? null,
    openaiChatModel: row?.openaiChatModel ?? null,
    openaiMindmapModel: row?.openaiMindmapModel ?? null,
    openaiEmbeddingModel: row?.openaiEmbeddingModel ?? null,
    openaiEndpoint: row?.openaiEndpoint ?? null,
  }
}

function buildModelOptions(row: Awaited<ReturnType<typeof getUserAiSettings>>) {
  if (!row) return undefined
  return {
    provider: row.provider,
    apiKey: row.encryptedApiKey ? decryptApiKey(row.encryptedApiKey, ENCRYPTION_SECRET) : '',
    lmStudioChatModel: row.lmStudioChatModel,
    lmStudioMindmapModel: row.lmStudioMindmapModel,
    lmStudioEmbeddingModel: row.lmStudioEmbeddingModel,
    openrouterChatModel: row.openrouterChatModel,
    openrouterMindmapModel: row.openrouterMindmapModel,
    openrouterEmbeddingModel: row.openrouterEmbeddingModel,
    openrouterEndpoint: row.openrouterEndpoint,
    anthropicChatModel: row.anthropicChatModel,
    anthropicMindmapModel: row.anthropicMindmapModel,
    anthropicEmbeddingModel: row.anthropicEmbeddingModel,
    openaiChatModel: row.openaiChatModel,
    openaiMindmapModel: row.openaiMindmapModel,
    openaiEmbeddingModel: row.openaiEmbeddingModel,
    openaiEndpoint: row.openaiEndpoint,
  }
}

// ─── GET /api/settings/ai ─────────────────────────────────────────────────────

settingsRoutes.get('/access-policy', (c) => {
  return c.json({
    allowedEmailDomain: accessPolicyConfig.allowedEmailDomain,
    allowedGitHubOrg: accessPolicyConfig.allowedGitHubOrg,
    allowedRepositoryHost: accessPolicyConfig.allowedRepositoryHost,
    editable: false,
  })
})

settingsRoutes.get('/ai', async (c) => {
  const userId = c.get('userId')
  const row = await getUserAiSettings(userId)
  return c.json(buildAiSettingsResponse(row))
})

// ─── PUT /api/settings/ai ─────────────────────────────────────────────────────

const updateAiSettingsSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'openrouter', 'lmstudio']),
  apiKey: z.string().min(1).optional(),
  clearApiKey: z.boolean().optional(),
  lmStudioChatModel: z.string().min(1).nullable().optional(),
  lmStudioMindmapModel: z.string().min(1).nullable().optional(),
  lmStudioEmbeddingModel: z.string().min(1).nullable().optional(),
  openrouterChatModel: z.string().min(1).nullable().optional(),
  openrouterMindmapModel: z.string().min(1).nullable().optional(),
  openrouterEmbeddingModel: z.string().min(1).nullable().optional(),
  openrouterEndpoint: z.string().url().nullable().optional(),
  anthropicChatModel: z.string().min(1).nullable().optional(),
  anthropicMindmapModel: z.string().min(1).nullable().optional(),
  anthropicEmbeddingModel: z.string().min(1).nullable().optional(),
  openaiChatModel: z.string().min(1).nullable().optional(),
  openaiMindmapModel: z.string().min(1).nullable().optional(),
  openaiEmbeddingModel: z.string().min(1).nullable().optional(),
  openaiEndpoint: z.string().url().nullable().optional(),
})

settingsRoutes.put('/ai', async (c) => {
  const userId = c.get('userId')
  const body = updateAiSettingsSchema.parse(await c.req.json())

  if (!ENCRYPTION_SECRET) {
    throw new AppError(500, 'Server misconfiguration: encryption secret missing', 'CONFIG_ERROR')
  }

  let encryptedApiKey: string | null | undefined = undefined
  if (body.clearApiKey) {
    encryptedApiKey = null
  } else if (body.apiKey) {
    encryptedApiKey = encryptApiKey(body.apiKey, ENCRYPTION_SECRET)
  }

  // Build the update payload — only include fields that were explicitly sent
  const updateValues: Parameters<typeof upsertUserAiSettings>[1] = {
    provider: body.provider,
    ...(encryptedApiKey !== undefined && { encryptedApiKey }),
  }

  const optionalFields = [
    'lmStudioChatModel',
    'lmStudioMindmapModel',
    'lmStudioEmbeddingModel',
    'openrouterChatModel',
    'openrouterMindmapModel',
    'openrouterEmbeddingModel',
    'openrouterEndpoint',
    'anthropicChatModel',
    'anthropicMindmapModel',
    'anthropicEmbeddingModel',
    'openaiChatModel',
    'openaiMindmapModel',
    'openaiEmbeddingModel',
    'openaiEndpoint',
  ] as const

  for (const field of optionalFields) {
    if (body[field] !== undefined) {
      ;(updateValues as Record<string, unknown>)[field] = body[field]
    }
  }

  const row = await upsertUserAiSettings(userId, updateValues)
  return c.json(buildAiSettingsResponse(row))
})

// ─── GET /api/settings/lmstudio-models ────────────────────────────────────────
// Proxy LM Studio's /v1/models to avoid CORS in the browser.

settingsRoutes.get('/lmstudio-models', async (c) => {
  const baseURL = process.env.LM_STUDIO_BASE_URL ?? 'http://localhost:1234/v1'
  try {
    const res = await fetch(`${baseURL}/models`)
    if (!res.ok) throw new Error(`LM Studio responded ${res.status}`)
    const data = (await res.json()) as { data: { id: string }[] }
    const allModels = data.data.map((m) => m.id)
    const embedding = allModels.filter((id) => id.toLowerCase().includes('embed'))
    const chat = allModels.filter((id) => !id.toLowerCase().includes('embed'))
    return c.json({ embedding, chat })
  } catch (err) {
    return c.json(
      { embedding: [], chat: [], error: err instanceof Error ? err.message : String(err) },
      200,
    )
  }
})

// ─── GET /api/settings/openrouter-models ──────────────────────────────────────
// Fetch available models from OpenRouter's API.

settingsRoutes.get('/openrouter-models', async (c) => {
  const userId = c.get('userId')
  const row = await getUserAiSettings(userId)
  const apiKey = row?.encryptedApiKey ? decryptApiKey(row.encryptedApiKey, ENCRYPTION_SECRET) : ''

  if (!apiKey) {
    return c.json(
      { embedding: [], chat: [], error: 'No API key configured. Save your OpenRouter key first.' },
      200,
    )
  }

  try {
    const endpoint = row?.openrouterEndpoint || 'https://openrouter.ai/api/v1'
    const res = await fetch(`${endpoint}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) throw new Error(`OpenRouter responded ${res.status}`)
    const data = (await res.json()) as { data: { id: string }[] }
    const allModels = data.data.map((m) => m.id).sort()
    const embedding = allModels.filter((id) => id.toLowerCase().includes('embed'))
    const chat = allModels.filter((id) => !id.toLowerCase().includes('embed'))
    return c.json({ embedding, chat })
  } catch (err) {
    return c.json(
      { embedding: [], chat: [], error: err instanceof Error ? err.message : String(err) },
      200,
    )
  }
})

// ─── GET /api/settings/anthropic-models ──────────────────────────────────────
// Returns curated list of Anthropic models (no public listing API).

settingsRoutes.get('/anthropic-models', (c) => {
  return c.json({
    embedding: [] as string[],
    chat: [
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-sonnet-4-5-20250514',
      'claude-haiku-4-5-20251001',
    ],
  })
})

// ─── GET /api/settings/openai-models ─────────────────────────────────────────
// Fetch available models from OpenAI's API, or return curated defaults.

settingsRoutes.get('/openai-models', async (c) => {
  const userId = c.get('userId')
  const row = await getUserAiSettings(userId)
  const apiKey = row?.encryptedApiKey ? decryptApiKey(row.encryptedApiKey, ENCRYPTION_SECRET) : ''

  const curatedEmbedding = [
    'text-embedding-3-small',
    'text-embedding-3-large',
    'text-embedding-ada-002',
  ]
  const curatedChat = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'o4-mini', 'o3-mini']

  if (!apiKey) {
    return c.json({ embedding: curatedEmbedding, chat: curatedChat })
  }

  try {
    const baseURL = row?.openaiEndpoint || 'https://api.openai.com/v1'
    const res = await fetch(`${baseURL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) throw new Error(`OpenAI responded ${res.status}`)
    const data = (await res.json()) as { data: { id: string }[] }
    const allModels = data.data.map((m) => m.id).sort()
    const embedding = allModels.filter((id) => id.includes('embedding'))
    const chat = allModels.filter(
      (id) =>
        id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4'),
    )
    return c.json({
      embedding: embedding.length > 0 ? embedding : curatedEmbedding,
      chat: chat.length > 0 ? chat : curatedChat,
    })
  } catch (err) {
    return c.json({
      embedding: curatedEmbedding,
      chat: curatedChat,
      error: err instanceof Error ? err.message : String(err),
    })
  }
})

// ─── POST /api/settings/test ──────────────────────────────────────────────────

const testAiSettingsSchema = updateAiSettingsSchema.omit({ clearApiKey: true }).partial()

function buildTestModelOptions(
  row: Awaited<ReturnType<typeof getUserAiSettings>>,
  overrides: z.infer<typeof testAiSettingsSchema>,
) {
  const base = buildModelOptions(row) ?? {
    provider: 'lmstudio' as const,
    apiKey: '',
  }

  return {
    ...base,
    ...overrides,
    provider: overrides.provider ?? base.provider,
    apiKey: overrides.apiKey ?? base.apiKey,
  }
}

settingsRoutes.post('/test', async (c) => {
  const userId = c.get('userId')
  const row = await getUserAiSettings(userId)
  const rawBody = await c.req.text()
  const body = testAiSettingsSchema.parse(rawBody ? JSON.parse(rawBody) : {})
  const modelOptions = buildTestModelOptions(row, body)
  const results: Record<
    string,
    { ok: boolean; latencyMs: number; error?: string; dimensions?: number }
  > = {}

  // ── Test embedding model ───────────────────────────────────────────────────
  const embStart = Date.now()
  try {
    const profile = await probeEmbeddingProfile(modelOptions)
    results.embedding = {
      ok: true,
      latencyMs: Date.now() - embStart,
      dimensions: profile.dimensions,
    }
  } catch (err) {
    results.embedding = {
      ok: false,
      latencyMs: Date.now() - embStart,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Test LLM ──────────────────────────────────────────────────────────────
  const llmStart = Date.now()
  try {
    const { text, reasoningText } = await generateText({
      model: getModel('mindmap', modelOptions),
      prompt: 'Reply with only the word "ok".',
      maxOutputTokens: 2000,
    })

    if (!text.trim() && !reasoningText?.trim()) throw new Error('Empty response from LLM')
    results.llm = { ok: true, latencyMs: Date.now() - llmStart }
  } catch (err) {
    results.llm = {
      ok: false,
      latencyMs: Date.now() - llmStart,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  return c.json({ results })
})
