import type { RetrievalPolicy } from '@convergekit/db'
import { getDocumentByPath, getDocumentPaths, searchChunks } from '@convergekit/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getStructureTool, readFileTool, searchDocsTool } from './agent-tools.js'

vi.mock('@convergekit/db', () => ({
  searchChunks: vi.fn(),
  getDocumentByPath: vi.fn(),
  getDocumentPaths: vi.fn(),
}))

const mockedSearchChunks = vi.mocked(searchChunks)
const mockedGetDocumentByPath = vi.mocked(getDocumentByPath)
const mockedGetDocumentPaths = vi.mocked(getDocumentPaths)

describe('searchDocsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns evidence metadata from the executed search tool', async () => {
    mockedSearchChunks.mockResolvedValue([
      {
        chunkId: 'chunk-1',
        documentId: 'doc-1',
        path: 'src/auth/login.ts',
        startLine: 10,
        endLine: 42,
        chunkType: 'function',
        content: 'export function login() {}',
        score: 0.82,
        normalizedHybridScore: 0.91,
        evidenceTier: 'A',
        evidenceKind: 'code',
        evidenceAlignmentStatus: 'aligned',
        retrievalIntent: 'current_code',
        retrievalLane: 'current',
      },
    ])

    const toolDef = searchDocsTool('repo-1') as unknown as {
      execute(input: {
        query: string
        limit?: number
        chunkType?: 'function'
      }): Promise<Array<Record<string, unknown>>>
    }

    const results = await toolDef.execute({ query: 'login flow', limit: 5, chunkType: 'function' })

    expect(mockedSearchChunks).toHaveBeenCalledWith('repo-1', 'login flow', {
      limit: 5,
      chunkType: 'function',
      embeddingOptions: undefined,
    })
    expect(results[0]).toMatchObject({
      path: 'src/auth/login.ts',
      startLine: 10,
      endLine: 42,
      chunkType: 'function',
      content: 'export function login() {}',
      score: 0.82,
      normalizedHybridScore: 0.91,
      evidenceTier: 'A',
      evidenceKind: 'code',
      evidenceAlignmentStatus: 'aligned',
      retrievalIntent: 'current_code',
      retrievalLane: 'current',
    })
  })

  it('uses the fixed chat retrieval policy instead of reclassifying the tool query', async () => {
    const retrievalPolicy: RetrievalPolicy = {
      intent: 'current_code',
      currentTiers: ['A', 'B'],
      currentFallbackTiers: ['C'],
      historicalTiers: [],
      supportTiers: [],
      historicalContextEnabled: false,
    }

    mockedSearchChunks.mockResolvedValue([])

    const toolDef = searchDocsTool('repo-1', undefined, retrievalPolicy) as unknown as {
      execute(input: { query: string; limit?: number }): Promise<Array<Record<string, unknown>>>
    }

    await toolDef.execute({ query: 'why was login designed this way?', limit: 4 })

    expect(mockedSearchChunks).toHaveBeenCalledWith('repo-1', 'why was login designed this way?', {
      limit: 4,
      chunkType: undefined,
      embeddingOptions: undefined,
      retrievalPolicy,
    })
  })

  it('bounds large search result content with truncation metadata', async () => {
    const longContent = 'approval workflow '.repeat(2_000)
    mockedSearchChunks.mockResolvedValue([
      {
        chunkId: 'chunk-1',
        documentId: 'doc-1',
        path: 'app/models/approval.rb',
        startLine: 1,
        endLine: 400,
        chunkType: 'class',
        content: longContent,
        score: 0.9,
        normalizedHybridScore: 0.9,
        evidenceTier: 'A',
        evidenceKind: 'code',
        evidenceAlignmentStatus: 'aligned',
        retrievalIntent: 'current_code',
        retrievalLane: 'current',
      },
    ])

    const toolDef = searchDocsTool('repo-1') as unknown as {
      execute(input: { query: string; limit?: number }): Promise<Array<Record<string, unknown>>>
    }

    const [result] = await toolDef.execute({ query: 'approval workflow', limit: 5 })

    expect(typeof result.content).toBe('string')
    expect(String(result.content).length).toBeLessThan(longContent.length)
    expect(result).toMatchObject({
      contentTruncated: true,
      omittedCharacters: expect.any(Number),
    })
  })
})

describe('readFileTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('bounds full file content with truncation metadata', async () => {
    const longContent = 'class Approval\n'.repeat(3_000)
    mockedGetDocumentByPath.mockResolvedValue({
      id: 'doc-1',
      path: 'app/models/approval.rb',
      programmingLanguage: 'ruby',
      content: longContent,
    })

    const toolDef = readFileTool('repo-1') as unknown as {
      execute(input: { path: string }): Promise<Record<string, unknown>>
    }

    const result = await toolDef.execute({ path: 'app/models/approval.rb' })

    expect(mockedGetDocumentByPath).toHaveBeenCalledWith('repo-1', 'app/models/approval.rb')
    expect(typeof result.content).toBe('string')
    expect(String(result.content).length).toBeLessThan(longContent.length)
    expect(result).toMatchObject({
      path: 'app/models/approval.rb',
      programmingLanguage: 'ruby',
      truncated: true,
      omittedCharacters: expect.any(Number),
      note: expect.stringContaining('truncated'),
    })
  })
})

describe('getStructureTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a bounded path list with omitted path metadata', async () => {
    const paths = Array.from({ length: 650 }, (_, index) => ({
      path: `app/models/generated_${index}.rb`,
      programmingLanguage: 'ruby',
    }))
    mockedGetDocumentPaths.mockResolvedValue(paths)

    const toolDef = getStructureTool('repo-1') as unknown as {
      execute(input: { pathPrefix?: string }): Promise<Record<string, unknown>>
    }

    const result = await toolDef.execute({ pathPrefix: 'app/models' })

    expect(mockedGetDocumentPaths).toHaveBeenCalledWith('repo-1', 'app/models')
    expect(result).toMatchObject({
      count: 650,
      truncated: true,
      omittedPaths: expect.any(Number),
      note: expect.stringContaining('truncated'),
    })
    expect(Array.isArray(result.paths)).toBe(true)
    expect((result.paths as unknown[]).length).toBeLessThan(paths.length)
  })
})
