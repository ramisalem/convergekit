import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAiSettings: vi.fn(),
  getDocByPath: vi.fn(),
  getDocPaths: vi.fn(),
  getReposMeta: vi.fn(),
  getReposTopics: vi.fn(),
  getPrimaryLanguages: vi.fn(),
  searchChunks: vi.fn(),
  getEmbState: vi.fn(),
  getEmbOpts: vi.fn(),
  scopedRepoIds: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock('@convergekit/db', () => ({
  getAiSettingsForRepo: mocks.getAiSettings,
  getDocumentByPath: mocks.getDocByPath,
  getDocumentPaths: mocks.getDocPaths,
  getPrimaryLanguagesByIds: mocks.getPrimaryLanguages,
  getRepositoriesMetaByIds: mocks.getReposMeta,
  getRepositoryListingTopicsByIds: mocks.getReposTopics,
  searchChunks: mocks.searchChunks,
}))

vi.mock('../logger.js', () => ({
  logger: { error: mocks.loggerError },
}))

vi.mock('./embedding-compatibility.js', () => ({
  getRepositoryEmbeddingState: mocks.getEmbState,
  getEmbeddingOptionsForProfile: mocks.getEmbOpts,
}))

vi.mock('./scoping.js', () => ({
  scopedRepositoryIds: mocks.scopedRepoIds,
}))

import { buildUserServerDeps } from './mcp-oauth-tools.js'

describe('buildUserServerDeps', () => {
  beforeEach(() => {
    mocks.getAiSettings.mockReset()
    mocks.getDocByPath.mockReset()
    mocks.getDocPaths.mockReset()
    mocks.getReposMeta.mockReset()
    mocks.getReposTopics.mockReset()
    mocks.getPrimaryLanguages.mockReset()
    mocks.searchChunks.mockReset()
    mocks.getEmbState.mockReset()
    mocks.getEmbOpts.mockReset()
    mocks.scopedRepoIds.mockReset()
    mocks.loggerError.mockReset()
  })

  describe('listRepositories', () => {
    it('merges meta, primaryLanguage, description and topics per repo', async () => {
      mocks.scopedRepoIds.mockResolvedValue(new Set(['r1', 'r2']))
      mocks.getReposMeta.mockResolvedValue([
        { id: 'r1', name: 'alpha', defaultBranch: 'main', status: 'done', lastIndexedAt: '2026-06-01T00:00:00.000Z' },
        { id: 'r2', name: 'beta', defaultBranch: 'master', status: 'processing', lastIndexedAt: null },
      ])
      mocks.getPrimaryLanguages.mockResolvedValue(new Map([['r1', 'Ruby']]))
      mocks.getReposTopics.mockResolvedValue(
        new Map([
          ['r1', { description: 'Alpha service', topics: ['Auth', 'Billing'] }],
          ['r2', { description: null, topics: [] }],
        ]),
      )

      const deps = buildUserServerDeps('user-1')
      const result = await deps.listRepositories()

      expect(mocks.scopedRepoIds).toHaveBeenCalledWith('user-1')
      expect(mocks.getReposMeta).toHaveBeenCalledWith(['r1', 'r2'])
      expect(mocks.getReposTopics).toHaveBeenCalledWith(['r1', 'r2'])
      expect(mocks.getPrimaryLanguages).toHaveBeenCalledWith(['r1', 'r2'])
      expect(result).toEqual([
        {
          id: 'r1',
          name: 'alpha',
          defaultBranch: 'main',
          description: 'Alpha service',
          topics: ['Auth', 'Billing'],
          primaryLanguage: 'Ruby',
          lastIndexedAt: '2026-06-01T00:00:00.000Z',
          status: 'done',
        },
        {
          id: 'r2',
          name: 'beta',
          defaultBranch: 'master',
          description: null,
          topics: [],
          primaryLanguage: null,
          lastIndexedAt: null,
          status: 'processing',
        },
      ])
    })
  })

  describe('resolveRepository', () => {
    it('resolves by id when accessible', async () => {
      mocks.scopedRepoIds.mockResolvedValue(new Set(['r1']))

      const deps = buildUserServerDeps('user-1')
      const result = await deps.resolveRepository('r1')

      expect(result).toEqual({ ok: true, repositoryId: 'r1' })
    })

    it('resolves by exact name with a single match in the accessible set', async () => {
      mocks.scopedRepoIds.mockResolvedValue(new Set(['r1']))
      mocks.getReposMeta.mockResolvedValue([{ id: 'r1', name: 'alpha' }])

      const deps = buildUserServerDeps('user-1')
      const result = await deps.resolveRepository('alpha')

      expect(result).toEqual({ ok: true, repositoryId: 'r1' })
    })

    it('returns an ambiguous error mentioning both ids for duplicate names', async () => {
      mocks.scopedRepoIds.mockResolvedValue(new Set(['r1', 'r2']))
      mocks.getReposMeta.mockResolvedValue([
        { id: 'r1', name: 'dup' },
        { id: 'r2', name: 'dup' },
      ])

      const deps = buildUserServerDeps('user-1')
      const result = await deps.resolveRepository('dup')

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('expected failure')
      expect(result.error).toMatch(/ambiguous/i)
      expect(result.error).toContain('r1')
      expect(result.error).toContain('r2')
    })

    it('returns an IDENTICAL uniform error for inaccessible id and unknown name (no leak)', async () => {
      mocks.scopedRepoIds.mockResolvedValue(new Set(['r1']))
      mocks.getReposMeta.mockResolvedValue([{ id: 'r1', name: 'alpha' }])

      const deps = buildUserServerDeps('user-1')
      const inaccessibleId = await deps.resolveRepository('r2')
      const unknownName = await deps.resolveRepository('ghost')

      expect(inaccessibleId).toEqual({
        ok: false,
        error: 'Repository not found or not accessible',
      })
      expect(unknownName).toEqual({
        ok: false,
        error: 'Repository not found or not accessible',
      })
      // Proves no existence leak: both paths return the byte-identical message.
      expect(inaccessibleId).toEqual(unknownName)
    })
  })

  describe('searchDocs', () => {
    it('resolves embedding options and returns serialized chunk results', async () => {
      const aiSettings = { provider: 'openai' }
      const storedProfile = { model: 'nomic-embed-code' }
      const embeddingOptions = { dimensions: 3584 }
      mocks.getAiSettings.mockResolvedValue(aiSettings)
      mocks.getEmbState.mockResolvedValue({ storedProfile })
      mocks.getEmbOpts.mockReturnValue(embeddingOptions)
      mocks.searchChunks.mockResolvedValue([
        {
          path: 'src/index.ts',
          startLine: 1,
          endLine: 10,
          chunkType: 'function',
          content: 'export const main = () => {}',
          score: 0.92,
        },
      ])

      const deps = buildUserServerDeps('user-1')
      const json = await deps.searchDocs('r1', 'main', 5)
      const parsed = JSON.parse(json)

      expect(mocks.getAiSettings).toHaveBeenCalledWith('r1')
      expect(mocks.getEmbState).toHaveBeenCalledWith('r1', aiSettings)
      expect(mocks.getEmbOpts).toHaveBeenCalledWith(aiSettings, storedProfile)
      expect(mocks.searchChunks).toHaveBeenCalledWith('r1', 'main', {
        limit: 5,
        embeddingOptions,
      })
      expect(parsed).toEqual([
        {
          path: 'src/index.ts',
          startLine: 1,
          endLine: 10,
          chunkType: 'function',
          content: 'export const main = () => {}',
          score: 0.92,
        },
      ])
    })

    it('logs a structured error and rethrows when the underlying search call rejects', async () => {
      const aiSettings = { provider: 'openai' }
      const storedProfile = { model: 'nomic-embed-code' }
      const embeddingOptions = { dimensions: 3584 }
      mocks.getAiSettings.mockResolvedValue(aiSettings)
      mocks.getEmbState.mockResolvedValue({ storedProfile })
      mocks.getEmbOpts.mockReturnValue(embeddingOptions)
      const error = new Error('Insufficient credits')
      mocks.searchChunks.mockRejectedValue(error)

      const deps = buildUserServerDeps('user-1')

      await expect(deps.searchDocs('r1', 'main', 5)).rejects.toThrow('Insufficient credits')

      expect(mocks.loggerError).toHaveBeenCalledTimes(1)
      expect(mocks.loggerError).toHaveBeenCalledWith(
        {
          repositoryId: 'r1',
          query: 'main',
          limit: 5,
          error: { name: 'Error', message: 'Insufficient credits' },
        },
        'mcp search_docs failed',
      )
    })
  })

  describe('getStructure', () => {
    it('returns serialized document paths', async () => {
      mocks.getDocPaths.mockResolvedValue([{ path: 'a.ts', programmingLanguage: 'ts' }])

      const deps = buildUserServerDeps('user-1')
      const json = await deps.getStructure('r1', 'src/')

      expect(mocks.getDocPaths).toHaveBeenCalledWith('r1', 'src/')
      expect(JSON.parse(json)).toEqual([{ path: 'a.ts', programmingLanguage: 'ts' }])
    })
  })

  describe('readFile', () => {
    it('returns the document content when found', async () => {
      mocks.getDocByPath.mockResolvedValue({ content: 'hi' })

      const deps = buildUserServerDeps('user-1')
      const result = await deps.readFile('r1', 'a.ts')

      expect(mocks.getDocByPath).toHaveBeenCalledWith('r1', 'a.ts')
      expect(result).toBe('hi')
    })

    it('returns a not-found message when the document is missing', async () => {
      mocks.getDocByPath.mockResolvedValue(null)

      const deps = buildUserServerDeps('user-1')
      const result = await deps.readFile('r1', 'a.ts')

      expect(result).toBe('File not found: a.ts')
    })
  })
})
