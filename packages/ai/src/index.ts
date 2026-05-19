// AI provider setup
export { anthropic } from '@ai-sdk/anthropic'

// Multi-provider model factory — JDW-43
export { getModel } from './models.js'
export type { ModelPurpose, AIProvider, ModelOptions } from './models.js'

// API key encryption helpers
export { encryptApiKey, decryptApiKey, maskApiKey } from './encryption.js'

// Code chunker — JDW-34
export { chunkCode } from './chunkers/code.js'
export type { CodeChunk, ChunkType } from './chunkers/code.js'

// Embeddings — JDW-36 / JDW-37
export {
  embedChunks,
  embedQuery,
  probeEmbeddingProfile,
  resolveEmbeddingProfile,
  embeddingProfilesMatch,
} from './embeddings.js'
export type {
  EmbeddingModelOptions,
  EmbeddingProfile,
  ResolvedEmbeddingProfile,
} from './embeddings.js'

// Markdown, config, and text splitters — JDW-35
export { chunkMarkdown } from './chunkers/markdown.js'
export { chunkConfig } from './chunkers/config.js'
export type { ConfigFormat } from './chunkers/config.js'
export { chunkText } from './chunkers/text.js'
