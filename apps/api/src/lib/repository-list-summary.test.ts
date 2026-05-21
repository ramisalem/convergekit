import { describe, expect, it } from 'vitest'
import { buildRepositoryListSummaryMap } from './repository-list-summary.js'

describe('buildRepositoryListSummaryMap', () => {
  it('summarizes indexed state, dominant language, LOC, and user chat counts by repository', () => {
    const summaries = buildRepositoryListSummaryMap({
      repositoryIds: ['repo-a', 'repo-b'],
      documentStats: [
        { repositoryId: 'repo-a', programmingLanguage: 'typescript', fileCount: 3, loc: 1200 },
        { repositoryId: 'repo-a', programmingLanguage: 'markdown', fileCount: 1, loc: 40 },
        { repositoryId: 'repo-b', programmingLanguage: null, fileCount: 2, loc: 0 },
      ],
      branchStats: [
        { repositoryId: 'repo-a', indexedAt: new Date('2026-05-18T10:00:00.000Z') },
        { repositoryId: 'repo-a', indexedAt: new Date('2026-05-19T10:00:00.000Z') },
        { repositoryId: 'repo-b', indexedAt: null },
      ],
      chatCounts: [
        { repositoryId: 'repo-a', chatCount: 4 },
      ],
    })

    expect(summaries.get('repo-a')).toEqual({
      primaryLanguage: 'typescript',
      loc: 1240,
      chatCount: 4,
      indexedAt: '2026-05-19T10:00:00.000Z',
    })
    expect(summaries.get('repo-b')).toEqual({
      primaryLanguage: null,
      loc: 0,
      chatCount: 0,
      indexedAt: null,
    })
  })

  it('breaks dominant-language ties by LOC and then language name', () => {
    const summaries = buildRepositoryListSummaryMap({
      repositoryIds: ['repo-a'],
      documentStats: [
        { repositoryId: 'repo-a', programmingLanguage: 'typescript', fileCount: 2, loc: 100 },
        { repositoryId: 'repo-a', programmingLanguage: 'python', fileCount: 2, loc: 220 },
        { repositoryId: 'repo-a', programmingLanguage: 'ruby', fileCount: 2, loc: 220 },
      ],
      branchStats: [],
      chatCounts: [],
    })

    expect(summaries.get('repo-a')?.primaryLanguage).toBe('python')
  })
})
