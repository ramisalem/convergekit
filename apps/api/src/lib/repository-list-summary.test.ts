import { describe, expect, it, vi } from 'vitest'
import {
  attachRepositoryListSummaries,
  buildRepositoryListSummaries,
  type RepositoryListSummary,
} from './repository-list-summary.js'

const noRows = {
  branchRows: [],
  documentRows: [],
  languageRows: [],
  chatRows: [],
}

vi.mock('@convergekit/db', () => ({
  branches: {},
  chatSessions: {},
  db: {},
  documents: {},
}))

const baseRepository = {
  id: '8c8e7c75-9a8d-4ef2-877b-5fb8a68ab741',
  name: 'example-backend',
  cloneUrl: 'https://github.com/example-org/example-backend.git',
  provider: 'github' as const,
  defaultBranch: 'main',
  isPrivate: true,
  status: 'done' as const,
  userId: 'user-1',
  createdAt: new Date('2026-04-26T00:00:00.000Z'),
  updatedAt: new Date('2026-04-26T00:00:00.000Z'),
  deletedAt: null,
}

describe('attachRepositoryListSummaries', () => {
  it('adds list metrics to matching repositories', () => {
    const summary: RepositoryListSummary = {
      chatCount: 47,
      indexedAt: '2026-06-01T10:00:00.000Z',
      loc: 1_225_487,
      primaryLanguage: 'Ruby',
    }

    const repositories = attachRepositoryListSummaries(
      [baseRepository],
      new Map([[baseRepository.id, summary]]),
    )

    expect(repositories[0]).toMatchObject({ listSummary: summary })
  })

  it('uses an explicit empty summary when a repository has no aggregate rows', () => {
    const repositories = attachRepositoryListSummaries([baseRepository], new Map())

    expect(repositories[0]?.listSummary).toEqual({
      chatCount: 0,
      indexedAt: null,
      loc: 0,
      primaryLanguage: null,
    })
  })
})

describe('buildRepositoryListSummaries', () => {
  const repoA = 'a0000000-0000-4000-8000-000000000001'
  const repoB = 'b0000000-0000-4000-8000-000000000002'

  it('initializes a deduplicated empty summary for every requested repository', () => {
    const summaries = buildRepositoryListSummaries([repoA, repoA, repoB], noRows)

    expect([...summaries.keys()]).toEqual([repoA, repoB])
    expect(summaries.get(repoA)).toEqual({
      chatCount: 0,
      indexedAt: null,
      loc: 0,
      primaryLanguage: null,
    })
  })

  it('returns an empty map when no repository ids are requested', () => {
    expect(buildRepositoryListSummaries([], noRows).size).toBe(0)
  })

  it('merges branch, document, language, and chat metrics for a repository', () => {
    const summaries = buildRepositoryListSummaries([repoA], {
      branchRows: [{ repositoryId: repoA, indexedAt: new Date('2026-06-01T10:00:00.000Z') }],
      documentRows: [{ repositoryId: repoA, loc: 1_225_487 }],
      languageRows: [{ repositoryId: repoA, primaryLanguage: 'Ruby', documentCount: 12 }],
      chatRows: [{ repositoryId: repoA, chatCount: 47 }],
    })

    expect(summaries.get(repoA)).toEqual({
      chatCount: 47,
      indexedAt: '2026-06-01T10:00:00.000Z',
      loc: 1_225_487,
      primaryLanguage: 'Ruby',
    })
  })

  it('parses numeric counts that arrive as strings and treats null loc as zero', () => {
    const summaries = buildRepositoryListSummaries([repoA], {
      ...noRows,
      documentRows: [{ repositoryId: repoA, loc: null }],
      chatRows: [{ repositoryId: repoA, chatCount: '47' }],
    })

    expect(summaries.get(repoA)?.loc).toBe(0)
    expect(summaries.get(repoA)?.chatCount).toBe(47)
  })

  it('converts string branch timestamps to ISO and leaves null timestamps null', () => {
    const withString = buildRepositoryListSummaries([repoA], {
      ...noRows,
      branchRows: [{ repositoryId: repoA, indexedAt: '2026-06-01T10:00:00.000Z' }],
    })
    const withNull = buildRepositoryListSummaries([repoB], {
      ...noRows,
      branchRows: [{ repositoryId: repoB, indexedAt: null }],
    })

    expect(withString.get(repoA)?.indexedAt).toBe('2026-06-01T10:00:00.000Z')
    expect(withNull.get(repoB)?.indexedAt).toBeNull()
  })

  it('picks the language with the most documents, breaking ties lexicographically', () => {
    const summaries = buildRepositoryListSummaries([repoA], {
      ...noRows,
      languageRows: [
        { repositoryId: repoA, primaryLanguage: 'Ruby', documentCount: 10 },
        { repositoryId: repoA, primaryLanguage: 'Go', documentCount: 10 },
        { repositoryId: repoA, primaryLanguage: 'TypeScript', documentCount: 3 },
      ],
    })

    expect(summaries.get(repoA)?.primaryLanguage).toBe('Go')
  })

  it('lets a strictly higher document count win over a lexicographically smaller language', () => {
    const summaries = buildRepositoryListSummaries([repoA], {
      ...noRows,
      languageRows: [
        { repositoryId: repoA, primaryLanguage: 'Go', documentCount: 5 },
        { repositoryId: repoA, primaryLanguage: 'Python', documentCount: 20 },
      ],
    })

    expect(summaries.get(repoA)?.primaryLanguage).toBe('Python')
  })

  it('ignores language rows with a null language', () => {
    const summaries = buildRepositoryListSummaries([repoA], {
      ...noRows,
      languageRows: [{ repositoryId: repoA, primaryLanguage: null, documentCount: 99 }],
    })

    expect(summaries.get(repoA)?.primaryLanguage).toBeNull()
  })

  it('ignores aggregate rows for repositories that were not requested', () => {
    const summaries = buildRepositoryListSummaries([repoA], {
      branchRows: [{ repositoryId: repoB, indexedAt: new Date('2026-06-01T10:00:00.000Z') }],
      documentRows: [{ repositoryId: repoB, loc: 999 }],
      languageRows: [{ repositoryId: repoB, primaryLanguage: 'Go', documentCount: 9 }],
      chatRows: [{ repositoryId: repoB, chatCount: 9 }],
    })

    expect(summaries.has(repoB)).toBe(false)
    expect(summaries.get(repoA)).toEqual({
      chatCount: 0,
      indexedAt: null,
      loc: 0,
      primaryLanguage: null,
    })
  })
})
