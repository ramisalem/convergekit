import { describe, expect, it } from 'vitest'

// These are pure-function tests, but repository-listing-topics.ts transitively
// imports the db client, which throws at import time when DATABASE_URL is unset
// (CI runs the db unit tests without a database). Match the indexing-runs.test.ts
// pattern: set a placeholder URL and load the module dynamically.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://unit-test:unit-test@localhost:1/unit_test'
}

const {
  buildRepositoryListingTopics,
  pickPrimaryLanguages,
  pickRepresentativeBranchIds,
  TOPICS_LIMIT,
} = await import('./repository-listing-topics.js')

describe('pickRepresentativeBranchIds', () => {
  it('picks the most-recently-indexed branch', () => {
    const map = pickRepresentativeBranchIds([
      { repositoryId: 'r1', branchId: 'b-old', branchName: 'main', defaultBranch: 'main', lastIndexedAt: new Date('2026-01-01') },
      { repositoryId: 'r1', branchId: 'b-new', branchName: 'feature', defaultBranch: 'main', lastIndexedAt: new Date('2026-06-01') },
    ])
    expect(map.get('r1')).toBe('b-new')
  })

  it('breaks ties toward the default branch, then by id', () => {
    const sameTime = new Date('2026-06-01')
    const map = pickRepresentativeBranchIds([
      { repositoryId: 'r1', branchId: 'b-zzz', branchName: 'feature', defaultBranch: 'main', lastIndexedAt: sameTime },
      { repositoryId: 'r1', branchId: 'b-aaa', branchName: 'main', defaultBranch: 'main', lastIndexedAt: sameTime },
    ])
    expect(map.get('r1')).toBe('b-aaa') // default-branch match wins the tie
  })

  it('orders null last_indexed_at after any indexed branch', () => {
    const map = pickRepresentativeBranchIds([
      { repositoryId: 'r1', branchId: 'b-null', branchName: 'main', defaultBranch: 'main', lastIndexedAt: null },
      { repositoryId: 'r1', branchId: 'b-indexed', branchName: 'feature', defaultBranch: 'main', lastIndexedAt: new Date('2026-01-01') },
    ])
    expect(map.get('r1')).toBe('b-indexed')
  })

  it('is deterministic when all timestamps are null (default then id)', () => {
    const map = pickRepresentativeBranchIds([
      { repositoryId: 'r1', branchId: 'b-zzz', branchName: 'dev', defaultBranch: 'main', lastIndexedAt: null },
      { repositoryId: 'r1', branchId: 'b-aaa', branchName: 'main', defaultBranch: 'main', lastIndexedAt: null },
    ])
    expect(map.get('r1')).toBe('b-aaa')
  })
})

describe('buildRepositoryListingTopics', () => {
  const mindMap = (root: unknown) => JSON.stringify(root)

  it('uses mind-map root description and wiki titles (sections before pages)', () => {
    const result = buildRepositoryListingTopics(['r1'], {
      mindMapRows: [
        { repositoryId: 'r1', content: mindMap({ name: 'example-backend', description: 'HR backend', children: [] }) },
      ],
      wikiTitleRows: [
        { repositoryId: 'r1', title: 'Sick Leave Accrual', isSection: false, orderIndex: 0 },
        { repositoryId: 'r1', title: 'Leave Management', isSection: true, orderIndex: 1 },
      ],
    })
    expect(result.get('r1')).toEqual({
      description: 'HR backend',
      topics: ['Leave Management', 'Sick Leave Accrual'],
    })
  })

  it('falls back to root name when description is missing', () => {
    const result = buildRepositoryListingTopics(['r1'], {
      mindMapRows: [{ repositoryId: 'r1', content: mindMap({ name: 'toolkit', children: [] }) }],
      wikiTitleRows: [],
    })
    expect(result.get('r1')?.description).toBe('toolkit')
  })

  it('falls back to root name when description is an empty string', () => {
    const result = buildRepositoryListingTopics(['r1'], {
      mindMapRows: [
        { repositoryId: 'r1', content: mindMap({ name: 'toolkit', description: '', children: [] }) },
      ],
      wikiTitleRows: [],
    })
    expect(result.get('r1')?.description).toBe('toolkit')
  })

  it('falls back to mind-map area names when there are no wiki pages', () => {
    const result = buildRepositoryListingTopics(['r1'], {
      mindMapRows: [
        {
          repositoryId: 'r1',
          content: mindMap({
            name: 'r',
            description: 'd',
            children: [{ name: 'Auth' }, { name: 'Billing' }],
          }),
        },
      ],
      wikiTitleRows: [],
    })
    expect(result.get('r1')?.topics).toEqual(['Auth', 'Billing'])
  })

  it('caps topics at TOPICS_LIMIT and dedupes', () => {
    const wikiTitleRows = Array.from({ length: TOPICS_LIMIT + 5 }, (_, i) => ({
      repositoryId: 'r1',
      title: `Page ${i}`,
      isSection: false,
      orderIndex: i,
    }))
    wikiTitleRows.push({ repositoryId: 'r1', title: 'Page 0', isSection: false, orderIndex: 99 })
    const result = buildRepositoryListingTopics(['r1'], { mindMapRows: [], wikiTitleRows })
    expect(result.get('r1')?.topics).toHaveLength(TOPICS_LIMIT)
    expect(new Set(result.get('r1')?.topics).size).toBe(TOPICS_LIMIT)
  })

  it('returns empty defaults for a repo with no mind map and no wiki', () => {
    const result = buildRepositoryListingTopics(['r1'], { mindMapRows: [], wikiTitleRows: [] })
    expect(result.get('r1')).toEqual({ description: null, topics: [] })
  })

  it('treats malformed mind-map JSON as no description', () => {
    const result = buildRepositoryListingTopics(['r1'], {
      mindMapRows: [{ repositoryId: 'r1', content: '{not json' }],
      wikiTitleRows: [],
    })
    expect(result.get('r1')).toEqual({ description: null, topics: [] })
  })
})

describe('pickPrimaryLanguages', () => {
  it('picks the language with the highest document count', () => {
    const map = pickPrimaryLanguages([
      { repositoryId: 'r1', programmingLanguage: 'Ruby', documentCount: 50 },
      { repositoryId: 'r1', programmingLanguage: 'TypeScript', documentCount: 12 },
    ])
    expect(map.get('r1')).toBe('Ruby')
  })

  it('breaks count ties alphabetically', () => {
    const map = pickPrimaryLanguages([
      { repositoryId: 'r1', programmingLanguage: 'TypeScript', documentCount: 10 },
      { repositoryId: 'r1', programmingLanguage: 'Go', documentCount: 10 },
    ])
    expect(map.get('r1')).toBe('Go')
  })

  it('coerces string counts and ignores null languages', () => {
    const map = pickPrimaryLanguages([
      { repositoryId: 'r1', programmingLanguage: null, documentCount: '99' },
      { repositoryId: 'r1', programmingLanguage: 'Python', documentCount: '3' },
    ])
    expect(map.get('r1')).toBe('Python')
  })

  it('omits repos with no language rows', () => {
    const map = pickPrimaryLanguages([
      { repositoryId: 'r1', programmingLanguage: null, documentCount: 5 },
    ])
    expect(map.has('r1')).toBe(false)
  })
})
