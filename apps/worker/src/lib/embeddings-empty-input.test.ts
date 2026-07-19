import { beforeEach, describe, expect, it, vi } from 'vitest'

const aiMocks = vi.hoisted(() => ({
  embed: vi.fn(),
  embedMany: vi.fn(),
}))

vi.mock('ai', () => aiMocks)

describe('repository embedding inputs', () => {
  beforeEach(() => {
    aiMocks.embed.mockReset()
    aiMocks.embedMany.mockReset()
  })

  it('skips empty sanitized chunks while preserving result positions', async () => {
    aiMocks.embedMany.mockResolvedValue({ embeddings: [[1], [2]] })

    const { embedChunks } = await import('@convergekit/ai')
    const embeddings = await embedChunks(['first', '', '\0', 'second'])

    expect(aiMocks.embedMany).toHaveBeenCalledTimes(1)
    expect(aiMocks.embedMany.mock.calls[0][0].values).toEqual(['first', 'second'])
    expect(embeddings).toEqual([[1], null, null, [2]])
  })

  it('does not call the embedding provider when every chunk is empty', async () => {
    const { embedChunks } = await import('@convergekit/ai')
    const embeddings = await embedChunks(['', '\0'])

    expect(aiMocks.embedMany).not.toHaveBeenCalled()
    expect(aiMocks.embed).not.toHaveBeenCalled()
    expect(embeddings).toEqual([null, null])
  })

  it('fails indexing after a permanent provider failure instead of writing null embeddings', async () => {
    aiMocks.embedMany.mockRejectedValue({
      statusCode: 403,
      message: 'Key limit exceeded (total limit)',
      requestBodyValues: { input: ['sensitive chunk content'] },
    })

    const { embedChunks } = await import('@convergekit/ai')

    await expect(embedChunks(['first', 'second'])).rejects.toThrow('Key limit exceeded')
    expect(aiMocks.embedMany).toHaveBeenCalledTimes(1)
    expect(aiMocks.embed).not.toHaveBeenCalled()
  })
})
