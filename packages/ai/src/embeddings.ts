import { createOpenAI } from '@ai-sdk/openai'
import { embed, embedMany } from 'ai'
import { createHash } from 'crypto'
import { Redis as IORedis } from 'ioredis'
import { logger } from './logger.js'
import type { AIProvider } from './models.js'

// ─── Model factory ────────────────────────────────────────────────────────────

export interface EmbeddingModelOptions {
  provider?: AIProvider
  apiKey?: string
  lmStudioEmbeddingModel?: string | null
  openrouterEmbeddingModel?: string | null
  openrouterEndpoint?: string | null
  anthropicEmbeddingModel?: string | null
  openaiEmbeddingModel?: string | null
  openaiEndpoint?: string | null
}

export interface ResolvedEmbeddingProfile {
  provider: AIProvider
  model: string
  endpoint: string | null
}

export interface EmbeddingProfile extends ResolvedEmbeddingProfile {
  dimensions: number
}

function normalizeEndpoint(endpoint?: string | null): string | null {
  return endpoint ? endpoint.replace(/\/+$/, '') : null
}

export function resolveEmbeddingProfile(options?: EmbeddingModelOptions): ResolvedEmbeddingProfile {
  const provider = options?.provider ?? 'openrouter'

  if (provider === 'openai') {
    return {
      provider,
      model: options?.openaiEmbeddingModel || 'text-embedding-3-small',
      endpoint: normalizeEndpoint(options?.openaiEndpoint || null),
    }
  }

  if (provider === 'anthropic') {
    return {
      provider,
      model: options?.anthropicEmbeddingModel || process.env.EMBEDDING_MODEL || 'nomic-embed-code',
      endpoint: normalizeEndpoint(process.env.EMBEDDING_BASE_URL ?? 'http://localhost:1234/v1'),
    }
  }

  if (provider === 'openrouter') {
    return {
      provider,
      model: options?.openrouterEmbeddingModel || 'openai/text-embedding-3-small',
      endpoint: normalizeEndpoint(options?.openrouterEndpoint || 'https://openrouter.ai/api/v1'),
    }
  }

  return {
    provider: 'lmstudio',
    model: options?.lmStudioEmbeddingModel || process.env.EMBEDDING_MODEL || 'nomic-embed-code',
    endpoint: normalizeEndpoint(process.env.EMBEDDING_BASE_URL ?? 'http://localhost:1234/v1'),
  }
}

export function embeddingProfilesMatch(
  expected: Pick<EmbeddingProfile, 'provider' | 'model' | 'endpoint'> | null | undefined,
  current: ResolvedEmbeddingProfile | null | undefined,
): boolean {
  if (!expected || !current) return false
  return (
    expected.provider === current.provider &&
    expected.model === current.model &&
    normalizeEndpoint(expected.endpoint) === normalizeEndpoint(current.endpoint)
  )
}

function getEmbeddingModel(options?: EmbeddingModelOptions) {
  const profile = resolveEmbeddingProfile(options)
  const provider = profile.provider

  if (provider === 'openai') {
    const baseURL = profile.endpoint || undefined
    const client = options?.apiKey
      ? createOpenAI({ apiKey: options.apiKey, baseURL })
      : createOpenAI({ baseURL })
    return client.embedding(profile.model)
  }

  if (provider === 'anthropic') {
    const baseURL = profile.endpoint || undefined
    const openai = createOpenAI({ baseURL, apiKey: 'not-required' })
    return openai.embedding(profile.model)
  }

  if (provider === 'openrouter') {
    const baseURL = profile.endpoint || undefined
    const apiKey = options?.apiKey || process.env.OPENROUTER_API_KEY || ''
    const openai = createOpenAI({ baseURL, apiKey })
    return openai.embedding(profile.model)
  }

  const baseURL = profile.endpoint || undefined
  const openai = createOpenAI({ baseURL, apiKey: 'not-required' })
  return openai.embedding(profile.model)
}

// ─── Redis client (lazy — only initialised on first use) ──────────────────────

let _redis: IORedis | null = null

function getRedis(): IORedis {
  if (!_redis) {
    const url = process.env.REDIS_URL
    if (!url) throw new Error('REDIS_URL is required for embedQuery caching')
    _redis = new IORedis(url, { maxRetriesPerRequest: null })
  }
  return _redis
}

/** Cache TTL for query embeddings in seconds. */
const EMBED_CACHE_TTL = 60

// ─── Public API ───────────────────────────────────────────────────────────────

export function buildEmbeddingCacheKey(query: string, options?: EmbeddingModelOptions): string {
  const profile = resolveEmbeddingProfile(options)
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        query,
        provider: profile.provider,
        model: profile.model,
        endpoint: profile.endpoint,
      }),
    )
    .digest('hex')

  return `embed:${hash}`
}

/**
 * Embed an array of text contents using the configured embedding model
 * (default: nomic-embed-code via LM Studio, 768 dimensions).
 * Uses the OpenAI-compatible /v1/embeddings endpoint — works with LM Studio,
 * Ollama, text-embeddings-inference, vLLM, and any other compatible server.
 */
// LM Studio's embedding server struggles with large batches.
const EMBED_BATCH_SIZE = 8

// nomic-embed-code has a 2048-token context limit (~8192 chars).
const MAX_CHUNK_CHARS = 8000

/** Strip characters that cause LM Studio's tokenizer to crash a batch. */
function sanitize(s: string): string {
  return s
    .replace(/\0/g, '') // null bytes
    .replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ') // non-printable control chars
    .slice(0, MAX_CHUNK_CHARS)
}

/** Embed a single string, returning null on failure so one bad chunk doesn't block others. */
async function embedOne(value: string, options?: EmbeddingModelOptions): Promise<number[] | null> {
  try {
    const { embedding } = await embed({ model: getEmbeddingModel(options), value })
    return embedding
  } catch (err) {
    logger.warn({ err }, 'Single chunk embedding failed — skipping')
    return null
  }
}

export async function embedChunks(
  contents: string[],
  options?: EmbeddingModelOptions,
): Promise<(number[] | null)[]> {
  if (contents.length === 0) return []

  const sanitized = contents.map(sanitize)
  logger.debug({ count: sanitized.length, batchSize: EMBED_BATCH_SIZE }, 'Embedding chunks')

  const results: (number[] | null)[] = []

  for (let i = 0; i < sanitized.length; i += EMBED_BATCH_SIZE) {
    const batch = sanitized.slice(i, i + EMBED_BATCH_SIZE)
    try {
      const { embeddings } = await embedMany({ model: getEmbeddingModel(options), values: batch })
      results.push(...embeddings)
    } catch {
      // Batch failed — fall back to one-by-one so a single bad chunk
      // doesn't abort the entire indexing job.
      logger.warn(
        { batchStart: i, batchSize: batch.length },
        'Batch embedding failed, retrying one-by-one',
      )
      for (const value of batch) {
        results.push(await embedOne(value, options))
      }
    }
    logger.debug({ done: results.length, total: sanitized.length }, 'Embedding progress')
  }

  return results
}

export async function probeEmbeddingProfile(
  options?: EmbeddingModelOptions,
): Promise<EmbeddingProfile> {
  const profile = resolveEmbeddingProfile(options)
  const { embedding } = await embed({
    model: getEmbeddingModel(options),
    value: 'embedding profile probe',
  })

  return {
    ...profile,
    dimensions: embedding.length,
  }
}

/**
 * Embed a single search query using the configured embedding model.
 * Results are cached in Redis for 60 seconds keyed by SHA-256 of the query
 * to avoid redundant calls for repeated or near-identical queries.
 */
export async function embedQuery(
  query: string,
  options?: EmbeddingModelOptions,
): Promise<number[]> {
  const cacheKey = buildEmbeddingCacheKey(query, options)
  const redis = getRedis()

  const cached = await redis.get(cacheKey)
  if (cached) {
    logger.debug({ cacheKey }, 'Query embedding cache hit')
    return JSON.parse(cached) as number[]
  }

  const { embedding } = await embed({
    model: getEmbeddingModel(options),
    value: query,
  })

  await redis.set(cacheKey, JSON.stringify(embedding), 'EX', EMBED_CACHE_TTL)
  logger.debug({ cacheKey }, 'Query embedding cached')

  return embedding
}
