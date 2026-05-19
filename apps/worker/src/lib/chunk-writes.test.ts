import { describe, expect, it } from 'vitest'
import { flushChunkWrites, type ChunkWrite } from './chunk-writes.js'

const chunk = (content: string): ChunkWrite => ({
  documentId: `doc-${content}`,
  chunk: {
    content,
    chunkType: 'block',
    startLine: 0,
    endLine: 1,
  },
})

describe('flushChunkWrites', () => {
  it('embeds and writes only the chunk batch it is given', async () => {
    const embeddedBatches: string[][] = []
    const writes: Array<{ documentId: string; embedding: number[] | null; content: string }> = []

    const result = await flushChunkWrites(
      [chunk('first'), chunk('second'), chunk('third')],
      undefined,
      {
        embedChunks: async (contents) => {
          embeddedBatches.push(contents)
          return [[1], null, [3]]
        },
        upsertChunk: async (documentId, values) => {
          writes.push({ documentId, embedding: values.embedding, content: values.content })
        },
      },
    )

    expect(embeddedBatches).toEqual([['first', 'second', 'third']])
    expect(writes).toEqual([
      { documentId: 'doc-first', embedding: [1], content: 'first' },
      { documentId: 'doc-second', embedding: null, content: 'second' },
      { documentId: 'doc-third', embedding: [3], content: 'third' },
    ])
    expect(result).toEqual({ written: 3, skippedEmbeddings: 1 })
  })
})
