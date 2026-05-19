import { embedChunks, type EmbeddingModelOptions } from '@convergekit/ai'
import type { DocumentChunk } from './chunker.js'

export const DEFAULT_INDEX_CHUNK_BATCH_SIZE = 64

export type ChunkWrite = {
  documentId: string
  chunk: DocumentChunk
}

type ChunkValues = {
  content: string
  chunkType: DocumentChunk['chunkType']
  startLine: number
  endLine: number
  embedding: number[] | null
  updatedAt: Date
}

type FlushChunkWriteDeps = {
  embedChunks?: typeof embedChunks
  upsertChunk?: (documentId: string, values: ChunkValues) => Promise<unknown>
}

async function defaultUpsertChunk(documentId: string, values: ChunkValues): Promise<unknown> {
  const { upsertChunk } = await import('@convergekit/db')
  return upsertChunk(documentId, values)
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function getIndexChunkBatchSize(env: NodeJS.ProcessEnv = process.env): number {
  return parsePositiveInt(env.INDEX_CHUNK_BATCH_SIZE, DEFAULT_INDEX_CHUNK_BATCH_SIZE)
}

export async function flushChunkWrites(
  batch: ChunkWrite[],
  embeddingOptions?: EmbeddingModelOptions,
  deps: FlushChunkWriteDeps = {},
): Promise<{ written: number; skippedEmbeddings: number }> {
  if (batch.length === 0) return { written: 0, skippedEmbeddings: 0 }

  const embed = deps.embedChunks ?? embedChunks
  const write = deps.upsertChunk ?? defaultUpsertChunk
  const embeddings = await embed(batch.map(({ chunk }) => chunk.content), embeddingOptions)
  let skippedEmbeddings = 0

  for (let i = 0; i < batch.length; i++) {
    const { documentId, chunk } = batch[i]
    const embedding = embeddings[i] ?? null
    if (embedding === null) skippedEmbeddings++

    await write(documentId, {
      content: chunk.content,
      chunkType: chunk.chunkType,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      embedding,
      updatedAt: new Date(),
    })
  }

  return { written: batch.length, skippedEmbeddings }
}
