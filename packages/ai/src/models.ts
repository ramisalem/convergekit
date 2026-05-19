import { anthropic, createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { LanguageModel } from 'ai'

// ─── Model purpose tiers ──────────────────────────────────────────────────────
//   'chat'        → full-capability model  (claude-sonnet / gpt-4o / qwen3.5)
//   'translation' → cheaper/faster tier    (claude-haiku / gpt-4o-mini / qwen3.5)
//   'mindmap'     → cheaper/faster tier    (claude-haiku / gpt-4o-mini / qwen3.5)

export type ModelPurpose = 'chat' | 'translation' | 'mindmap'
export type AIProvider = 'anthropic' | 'openai' | 'openrouter' | 'lmstudio'

// ─── Provider model maps ──────────────────────────────────────────────────────

const ANTHROPIC_MODELS: Record<ModelPurpose, string> = {
  chat: 'claude-sonnet-4-6',
  translation: 'claude-haiku-4-5-20251001',
  mindmap: 'claude-haiku-4-5-20251001',
}

const OPENAI_MODELS: Record<ModelPurpose, string> = {
  chat: 'gpt-4o',
  translation: 'gpt-4o-mini',
  mindmap: 'gpt-4o-mini',
}

// OpenRouter uses provider/model notation.
const OPENROUTER_MODELS: Record<ModelPurpose, string> = {
  chat: 'anthropic/claude-sonnet-4-5',
  translation: 'anthropic/claude-haiku-4-5',
  mindmap: 'anthropic/claude-haiku-4-5',
}

const OPENROUTER_DEEPSEEK_V4_PREFIX = 'deepseek/deepseek-v4'

export function getOpenRouterChatModelSettings(modelId: string) {
  if (!modelId.toLowerCase().startsWith(OPENROUTER_DEEPSEEK_V4_PREFIX)) return undefined

  // The current OpenRouter AI SDK provider does not replay DeepSeek V4 reasoning
  // blocks when AI SDK tool steps continue, so keep chat tool-calling in chat mode.
  return {
    extraBody: {
      reasoning: {
        effort: 'none',
      },
    },
  }
}

// LM Studio: all purposes use the same locally-served model by default.
// Override via LM_STUDIO_CHAT_MODEL / LM_STUDIO_MINDMAP_MODEL env vars.
const LMSTUDIO_MODELS: Record<ModelPurpose, string> = {
  chat: process.env.LM_STUDIO_CHAT_MODEL ?? 'qwen/qwen3.5-9b',
  translation: process.env.LM_STUDIO_MINDMAP_MODEL ?? 'qwen/qwen3.5-9b',
  mindmap: process.env.LM_STUDIO_MINDMAP_MODEL ?? 'qwen/qwen3.5-9b',
}

// ─── Provider resolution ──────────────────────────────────────────────────────

function resolveSystemProvider(): AIProvider {
  const raw = process.env.AI_PROVIDER?.toLowerCase()
  if (raw === 'anthropic') return 'anthropic'
  if (raw === 'openai') return 'openai'
  if (raw === 'openrouter') return 'openrouter'
  if (raw === 'lmstudio') return 'lmstudio'
  return 'openrouter'
}

// ─── Model factory ────────────────────────────────────────────────────────────

export interface ModelOptions {
  /** User-configured provider (overrides AI_PROVIDER env var) */
  provider: AIProvider
  /** Decrypted API key for the provider (not required for lmstudio) */
  apiKey: string
  /** Per-user LM Studio model overrides */
  lmStudioChatModel?: string | null
  lmStudioMindmapModel?: string | null
  lmStudioEmbeddingModel?: string | null
  /** Per-user OpenRouter model overrides */
  openrouterChatModel?: string | null
  openrouterMindmapModel?: string | null
  openrouterEmbeddingModel?: string | null
  openrouterEndpoint?: string | null
  /** Per-user Anthropic model overrides */
  anthropicChatModel?: string | null
  anthropicMindmapModel?: string | null
  anthropicEmbeddingModel?: string | null
  /** Per-user OpenAI model overrides */
  openaiChatModel?: string | null
  openaiMindmapModel?: string | null
  openaiEmbeddingModel?: string | null
  openaiEndpoint?: string | null
}

/**
 * Return the language model for a given use-case purpose.
 *
 * When `options` is provided (user has configured a provider + API key),
 * that takes precedence over the system-wide AI_PROVIDER env var.
 * Falls back to system env-var-configured provider when options are absent.
 */
export function getModel(purpose: ModelPurpose, options?: ModelOptions): LanguageModel {
  const provider = options?.provider ?? resolveSystemProvider()
  const apiKey = options?.apiKey

  switch (provider) {
    case 'lmstudio': {
      const baseURL = process.env.LM_STUDIO_BASE_URL ?? 'http://localhost:1234/v1'
      const client = createOpenAI({ baseURL, apiKey: 'not-required' })
      // Per-user model overrides take precedence over env var defaults
      const modelId = purpose === 'chat'
        ? (options?.lmStudioChatModel || LMSTUDIO_MODELS.chat)
        : (options?.lmStudioMindmapModel || LMSTUDIO_MODELS.mindmap)
      return client(modelId)
    }
    case 'openrouter': {
      const baseURL = options?.openrouterEndpoint || undefined
      const client = createOpenRouter({ apiKey: apiKey ?? process.env.OPENROUTER_API_KEY ?? '', baseURL })
      const modelId = purpose === 'chat'
        ? (options?.openrouterChatModel || OPENROUTER_MODELS.chat)
        : (options?.openrouterMindmapModel || OPENROUTER_MODELS[purpose])
      return purpose === 'chat'
        ? client.chat(modelId, getOpenRouterChatModelSettings(modelId))
        : client.chat(modelId)
    }
    case 'openai': {
      const baseURL = options?.openaiEndpoint || undefined
      const client = apiKey ? createOpenAI({ apiKey, baseURL }) : createOpenAI({ baseURL })
      const modelId = purpose === 'chat'
        ? (options?.openaiChatModel || OPENAI_MODELS.chat)
        : (options?.openaiMindmapModel || OPENAI_MODELS[purpose])
      return client(modelId)
    }
    case 'anthropic':
    default: {
      const client = apiKey ? createAnthropic({ apiKey }) : anthropic
      const modelId = purpose === 'chat'
        ? (options?.anthropicChatModel || ANTHROPIC_MODELS.chat)
        : (options?.anthropicMindmapModel || ANTHROPIC_MODELS[purpose])
      return client(modelId)
    }
  }
}
