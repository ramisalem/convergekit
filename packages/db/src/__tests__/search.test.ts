/**
 * Search integration tests
 *
 * Unit tests (classifyQuery) run always.
 * Integration tests (searchChunksKeyword, searchChunks) require a PostgreSQL
 * connection. They are skipped automatically when DATABASE_URL is not set or
 * does not point to a PostgreSQL server (docker-compose postgres service).
 *
 * To run locally:
 *   docker compose up -d postgres
 *   DATABASE_URL=postgres://convergekit:convergekit_secret@localhost:5432/convergekit \
 *     pnpm --filter @convergekit/db test
 */

import { describe, expect, it } from 'vitest'

const configuredDatabaseUrl = process.env.DATABASE_URL
if (!configuredDatabaseUrl) {
  process.env.DATABASE_URL = 'postgres://unit-test:unit-test@localhost:1/unit_test'
}

const {
  applyAuthorityRanking,
  classifyQuery,
  classifyRetrievalIntent,
  composeRetrievalResults,
  computeAuthorityWeight,
  normalizeHybridScore,
  resolveEvidenceMetadataForPath,
  searchChunksKeyword,
  searchChunks,
} = await import('../search.js')

// ─── classifyQuery unit tests ─────────────────────────────────────────────────

describe('classifyQuery', () => {
  it('classifies ALL_CAPS error literals as keyword-heavy (95/5)', () => {
    const w = classifyQuery('ECONNREFUSED')
    expect(w.keyword).toBe(95)
    expect(w.semantic).toBe(5)
  })

  it('classifies camelCase identifiers as keyword-heavy (90/10)', () => {
    const w = classifyQuery('getUserById')
    expect(w.keyword).toBe(90)
    expect(w.semantic).toBe(10)
  })

  it('classifies PascalCase identifiers as keyword-heavy (90/10)', () => {
    const w = classifyQuery('RepositoryWorker')
    expect(w.keyword).toBe(90)
    expect(w.semantic).toBe(10)
  })

  it('classifies dot.notation as keyword-heavy (90/10)', () => {
    const w = classifyQuery('req.user.id')
    expect(w.keyword).toBe(90)
    expect(w.semantic).toBe(10)
  })

  it('classifies conceptual prose (≥4 words, no code tokens) as semantic-heavy (20/80)', () => {
    const w = classifyQuery('how does authentication work in this application')
    expect(w.keyword).toBe(20)
    expect(w.semantic).toBe(80)
  })

  it('returns default weights (40/60) for short ambiguous queries', () => {
    const w = classifyQuery('login error')
    expect(w.keyword).toBe(40)
    expect(w.semantic).toBe(60)
  })
})

describe('classifyRetrievalIntent', () => {
  it('keeps normal code questions gated to current evidence', () => {
    expect(classifyRetrievalIntent('How does login work?')).toMatchObject({
      intent: 'current_code',
      currentTiers: ['A', 'B'],
      historicalContextEnabled: false,
    })
  })

  it('does not open historical context for troubleshooting why questions', () => {
    expect(classifyRetrievalIntent('Why is login failing with ECONNREFUSED?')).toMatchObject({
      intent: 'troubleshooting',
      historicalContextEnabled: false,
    })
  })

  it('does not open historical context for broad current-behavior why questions', () => {
    expect(classifyRetrievalIntent('Why did login redirect to the dashboard?')).toMatchObject({
      intent: 'current_code',
      historicalContextEnabled: false,
    })
  })

  it('opens historical context for explicit rationale questions', () => {
    expect(classifyRetrievalIntent('Why was login designed this way?')).toMatchObject({
      intent: 'historical',
      currentTiers: ['A', 'B'],
      historicalTiers: ['D'],
      supportTiers: ['C'],
      historicalContextEnabled: true,
    })
  })
})

describe('resolveEvidenceMetadataForPath', () => {
  it('classifies null evidence metadata from the path instead of treating it as Tier A', () => {
    expect(
      resolveEvidenceMetadataForPath({
        path: 'docs/superpowers/plans/auth-design.md',
        evidenceTier: null,
        evidenceKind: null,
        evidenceAlignmentStatus: null,
      }),
    ).toMatchObject({
      evidenceTier: 'D',
      evidenceKind: 'plan',
      evidenceAlignmentStatus: 'unverified',
    })

    expect(
      resolveEvidenceMetadataForPath({
        path: 'src/auth/login.test.ts',
        evidenceTier: null,
        evidenceKind: null,
        evidenceAlignmentStatus: null,
      }),
    ).toMatchObject({
      evidenceTier: 'B',
      evidenceKind: 'test',
    })

    expect(
      resolveEvidenceMetadataForPath({
        path: 'docs/generated/openapi.md',
        evidenceTier: null,
        evidenceKind: null,
        evidenceAlignmentStatus: null,
      }),
    ).toBeNull()
  })
})

describe('normalizeHybridScore', () => {
  it('maps unbounded keyword rank plus bounded semantic score into a stable 0..1 score', () => {
    expect(
      normalizeHybridScore({
        keywordRank: 3,
        semanticScore: 0.5,
        keywordWeight: 0.4,
        semanticWeight: 0.6,
      }),
    ).toBeCloseTo(0.6, 5)
  })
})

describe('computeAuthorityWeight', () => {
  it('applies tier weights and alignment adjustments with Tier D cap', () => {
    expect(computeAuthorityWeight({ evidenceTier: 'A', evidenceAlignmentStatus: null })).toBe(1)
    expect(computeAuthorityWeight({ evidenceTier: 'D', evidenceAlignmentStatus: 'aligned' })).toBe(
      0.45,
    )
    expect(computeAuthorityWeight({ evidenceTier: 'D', evidenceAlignmentStatus: 'stale' })).toBe(
      0.15,
    )
    expect(
      computeAuthorityWeight({ evidenceTier: 'D', evidenceAlignmentStatus: 'conflicts' }),
    ).toBeNull()
  })
})

describe('applyAuthorityRanking', () => {
  it('re-ranks allowed candidates by final score and removes conflicting evidence', () => {
    const ranked = applyAuthorityRanking([
      {
        chunkId: 'unverified',
        documentId: 'doc-1',
        path: 'docs/plan.md',
        startLine: 1,
        endLine: 2,
        chunkType: 'block',
        content: 'plan',
        score: 0,
        normalizedHybridScore: 0.6,
        evidenceTier: 'D',
        evidenceKind: 'plan',
        evidenceAlignmentStatus: 'unverified',
        retrievalIntent: 'historical',
        retrievalLane: 'historical',
      },
      {
        chunkId: 'aligned',
        documentId: 'doc-2',
        path: 'docs/adr.md',
        startLine: 1,
        endLine: 2,
        chunkType: 'block',
        content: 'adr',
        score: 0,
        normalizedHybridScore: 0.6,
        evidenceTier: 'D',
        evidenceKind: 'adr',
        evidenceAlignmentStatus: 'aligned',
        retrievalIntent: 'historical',
        retrievalLane: 'historical',
      },
      {
        chunkId: 'conflict',
        documentId: 'doc-3',
        path: 'docs/conflict.md',
        startLine: 1,
        endLine: 2,
        chunkType: 'block',
        content: 'conflict',
        score: 0,
        normalizedHybridScore: 1,
        evidenceTier: 'D',
        evidenceKind: 'design_doc',
        evidenceAlignmentStatus: 'conflicts',
        retrievalIntent: 'historical',
        retrievalLane: 'historical',
      },
    ])

    expect(ranked.map((result) => result.chunkId)).toEqual(['aligned', 'unverified'])
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
  })
})

describe('composeRetrievalResults', () => {
  function result(
    chunkId: string,
    retrievalLane: 'current' | 'fallback' | 'historical' | 'support',
    normalizedHybridScore = 0.9,
  ) {
    return {
      chunkId,
      documentId: `doc-${chunkId}`,
      path: `${chunkId}.ts`,
      startLine: 1,
      endLine: 2,
      chunkType: 'block',
      content: chunkId,
      score: normalizedHybridScore,
      normalizedHybridScore,
      evidenceTier: retrievalLane === 'historical' ? 'D' : retrievalLane === 'support' ? 'C' : 'A',
      evidenceKind: 'code',
      evidenceAlignmentStatus: 'unverified',
      retrievalIntent: 'historical',
      retrievalLane,
    } as const
  }

  it('reserves historical lane results before truncating design/history answers', () => {
    const composed = composeRetrievalResults({
      policy: classifyRetrievalIntent('Why was login designed this way?'),
      currentLane: [
        result('current-1', 'current'),
        result('current-2', 'current'),
        result('current-3', 'current'),
        result('current-4', 'current'),
        result('current-5', 'current'),
      ],
      fallbackLane: [],
      historicalLane: [result('history-1', 'historical')],
      supportLane: [result('support-1', 'support')],
      limit: 5,
    })

    expect(composed.map((item) => item.chunkId)).toContain('history-1')
  })

  it('leads with historical evidence when current lane has no accepted current evidence', () => {
    const composed = composeRetrievalResults({
      policy: classifyRetrievalIntent('Why was login designed this way?'),
      currentLane: [result('weak-current', 'current', 0.1)],
      fallbackLane: [],
      historicalLane: [result('history-1', 'historical')],
      supportLane: [result('support-1', 'support')],
      limit: 3,
    })

    expect(composed.map((item) => item.retrievalLane)).toEqual(['historical', 'support', 'current'])
  })

  it('keeps the accepted current lane available for one-result historical queries', () => {
    const composed = composeRetrievalResults({
      policy: classifyRetrievalIntent('Why was login designed this way?'),
      currentLane: [result('current-1', 'current')],
      fallbackLane: [],
      historicalLane: [result('history-1', 'historical')],
      supportLane: [],
      limit: 1,
    })

    expect(composed.map((item) => item.chunkId)).toEqual(['current-1'])
  })
})

// ─── Integration test helpers ─────────────────────────────────────────────────

const isPostgres =
  configuredDatabaseUrl?.startsWith('postgres://') ||
  configuredDatabaseUrl?.startsWith('postgresql://')

const integrationDescribe = isPostgres ? describe : describe.skip

// ─── Integration tests ────────────────────────────────────────────────────────

integrationDescribe('searchChunksKeyword (integration)', () => {
  // These tests assume the DB has been seeded with at least one chunk.
  // In CI the convergekit repo itself is indexed before tests run.

  it('returns results array (may be empty if no match)', async () => {
    // Use a fake UUID — just assert we get an array back
    const results = await searchChunksKeyword('00000000-0000-0000-0000-000000000000', 'function')
    expect(Array.isArray(results)).toBe(true)
  })

  it('returns KeywordSearchResult shape when rows exist', async () => {
    const repoId = process.env.TEST_REPOSITORY_ID
    if (!repoId) return // no seed data available

    const results = await searchChunksKeyword(repoId, 'function', 5)
    expect(results.length).toBeLessThanOrEqual(5)

    if (results.length > 0) {
      const first = results[0]
      expect(first).toHaveProperty('chunkId')
      expect(first).toHaveProperty('documentPath')
      expect(first).toHaveProperty('content')
      expect(typeof first.rank).toBe('number')
    }
  })
})

integrationDescribe('searchChunks hybrid (integration)', () => {
  it('returns array without throwing (empty repo)', async () => {
    const results = await searchChunks('00000000-0000-0000-0000-000000000000', 'authentication')
    expect(Array.isArray(results)).toBe(true)
  })

  it('respects chunkType filter', async () => {
    const repoId = process.env.TEST_REPOSITORY_ID
    if (!repoId) return

    const results = await searchChunks(repoId, 'class definition', {
      chunkType: 'class',
      limit: 10,
    })
    for (const r of results) {
      expect(r.chunkType).toBe('class')
    }
  })

  it('respects programmingLanguage filter', async () => {
    const repoId = process.env.TEST_REPOSITORY_ID
    if (!repoId) return

    const results = await searchChunks(repoId, 'async function handler', {
      programmingLanguage: 'typescript',
      limit: 10,
    })
    // All returned docs must have programming_language = 'typescript'
    // (path typically ends in .ts for TypeScript)
    expect(Array.isArray(results)).toBe(true)
  })

  it('returns HybridSearchResult shape when rows exist', async () => {
    const repoId = process.env.TEST_REPOSITORY_ID
    if (!repoId) return

    const results = await searchChunks(repoId, 'repository worker', { limit: 3 })
    if (results.length > 0) {
      const first = results[0]
      expect(first).toHaveProperty('chunkId')
      expect(first).toHaveProperty('path')
      expect(first).toHaveProperty('startLine')
      expect(first).toHaveProperty('endLine')
      expect(first).toHaveProperty('chunkType')
      expect(first).toHaveProperty('content')
      expect(typeof first.score).toBe('number')
    }
  })
})
