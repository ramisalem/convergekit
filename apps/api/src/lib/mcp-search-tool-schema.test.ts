import { MAX_SEARCH_QUERY_CHARS, searchDocsQuerySchema } from '@convergekit/mcp'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@convergekit/db', () => ({
  getDocumentByPath: vi.fn(),
  getDocumentPaths: vi.fn(),
  searchChunks: vi.fn(),
}))

describe('searchDocsQuerySchema', () => {
  it('accepts contextual queries longer than 500 characters', () => {
    const query = 'Explain these queried files and their relationship to the reported error. '.repeat(12)

    expect(query.length).toBeGreaterThan(500)
    expect(searchDocsQuerySchema.safeParse(query).success).toBe(true)
  })

  it('rejects empty queries', () => {
    expect(searchDocsQuerySchema.safeParse('').success).toBe(false)
  })

  it('rejects queries that exceed the contextual cap', () => {
    expect(searchDocsQuerySchema.safeParse('a'.repeat(MAX_SEARCH_QUERY_CHARS + 1)).success).toBe(
      false,
    )
  })
})
