import { embedQuery, type EmbeddingModelOptions } from '@convergekit/ai'
import { sql } from 'drizzle-orm'
import { db } from './client.js'
import {
  applyAuthorityRanking,
  classifyRetrievalIntent,
  normalizeHybridScore,
  resolveEvidenceMetadataForPath,
  type EvidenceAlignmentStatus,
  type EvidenceTier,
  type RetrievalIntent,
  type RetrievalPolicy,
} from './evidence.js'

export {
  applyAuthorityRanking,
  classifyRetrievalIntent,
  computeAuthorityWeight,
  normalizeHybridScore,
  resolveEvidenceMetadataForPath,
} from './evidence.js'

// ─── Query classifier ─────────────────────────────────────────────────────────

export interface QueryWeights {
  keyword: number
  semantic: number
}

/** Matches error literals: ALL_CAPS identifiers or quoted strings with symbols. */
const ERROR_LITERAL_RE = /^[A-Z][A-Z0-9_]{2,}$|^["'].*[_\-:.\/\\].*["']$/

/** Matches code identifiers: camelCase, PascalCase, dot.notation, bracket access. */
const CODE_IDENTIFIER_RE =
  /[a-z][A-Z]|[A-Z][a-z]{2,}[A-Z]|[a-zA-Z]\.[a-zA-Z]|\[['"]|['"]\]|::|->|\(\)|\{\}/

/** Tokens that strongly suggest code rather than prose. */
const CODE_TOKEN_RE = /[<>(){}\[\]|&!@#$%^*+=~`\\]|::|->|=>|\/\//

/**
 * Classify a search query into keyword vs semantic weights.
 *
 * - Error literals (ALL_CAPS, quoted-with-symbols) → 95 / 5
 * - Code identifier patterns (camelCase, PascalCase, dot.notation) → 90 / 10
 * - Conceptual prose (≥4 words, no code tokens) → 20 / 80
 * - Default → 40 / 60
 */
export function classifyQuery(query: string): QueryWeights {
  const trimmed = query.trim()

  if (ERROR_LITERAL_RE.test(trimmed)) {
    return { keyword: 95, semantic: 5 }
  }

  if (CODE_IDENTIFIER_RE.test(trimmed)) {
    return { keyword: 90, semantic: 10 }
  }

  const words = trimmed.split(/\s+/)
  if (words.length >= 4 && !CODE_TOKEN_RE.test(trimmed)) {
    return { keyword: 20, semantic: 80 }
  }

  return { keyword: 40, semantic: 60 }
}

// ─── Keyword search result ────────────────────────────────────────────────────

export interface KeywordSearchResult {
  chunkId: string
  documentId: string
  documentPath: string
  content: string
  startLine: number
  endLine: number
  chunkType: string
  rank: number
}

// ─── Phase 1: tsvector keyword search ────────────────────────────────────────

/**
 * Full-text keyword search over chunk contents within a repository.
 * Uses the GIN-indexed `search_vector` column and `plainto_tsquery` for natural
 * language query parsing. Results are ordered by `ts_rank` descending.
 */
export async function searchChunksKeyword(
  repositoryId: string,
  query: string,
  limit = 20,
): Promise<KeywordSearchResult[]> {
  const rows = await db.execute(sql`
    SELECT
      c.id                  AS "chunkId",
      c.document_id         AS "documentId",
      d.path                AS "documentPath",
      c.content             AS "content",
      c.start_line          AS "startLine",
      c.end_line            AS "endLine",
      c.chunk_type          AS "chunkType",
      ts_rank(c.search_vector, plainto_tsquery('english', ${query})) AS "rank"
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    JOIN branches b  ON b.id = d.branch_id
    WHERE b.repository_id = ${repositoryId}
      AND c.search_vector @@ plainto_tsquery('english', ${query})
    ORDER BY "rank" DESC
    LIMIT ${limit}
  `)

  return rows as unknown as KeywordSearchResult[]
}

// ─── Hybrid search result ─────────────────────────────────────────────────────

export interface HybridSearchResult {
  chunkId: string
  documentId: string
  path: string
  startLine: number
  endLine: number
  chunkType: string
  content: string
  score: number
  normalizedHybridScore: number
  evidenceTier: EvidenceTier
  evidenceKind: string | null
  evidenceAlignmentStatus: EvidenceAlignmentStatus | null
  retrievalIntent: RetrievalIntent
  retrievalLane: RetrievalLane
}

export interface SearchOptions {
  limit?: number
  chunkType?: 'function' | 'class' | 'method' | 'module' | 'block' | 'comment'
  programmingLanguage?: string
  embeddingOptions?: EmbeddingModelOptions
  retrievalPolicy?: RetrievalPolicy
}

type RetrievalLane = 'current' | 'fallback' | 'historical' | 'support'

type HybridSearchRow = {
  chunkId: string
  documentId: string
  path: string
  startLine: number
  endLine: number
  chunkType: string
  content: string
  keywordRank: number | string | null
  semanticScore: number | string | null
  evidenceTier: EvidenceTier | null
  evidenceKind: string | null
  evidenceAlignmentStatus: EvidenceAlignmentStatus | null
}

function hasAcceptedResult(results: HybridSearchResult[]) {
  return results.some((result) => result.normalizedHybridScore >= 0.2)
}

export function composeRetrievalResults(input: {
  policy: RetrievalPolicy
  currentLane: HybridSearchResult[]
  fallbackLane: HybridSearchResult[]
  historicalLane: HybridSearchResult[]
  supportLane: HybridSearchResult[]
  limit: number
}): HybridSearchResult[] {
  const limit = Math.max(0, input.limit)
  if (limit === 0) return []

  if (!input.policy.historicalContextEnabled) {
    return [...input.currentLane, ...input.fallbackLane].slice(0, limit)
  }

  const output: HybridSearchResult[] = []
  const pushUntilLimit = (items: HybridSearchResult[]) => {
    for (const item of items) {
      if (output.length >= limit) return
      output.push(item)
    }
  }

  if (!hasAcceptedResult(input.currentLane)) {
    pushUntilLimit(input.historicalLane)
    pushUntilLimit(input.supportLane)
    pushUntilLimit(input.currentLane)
    return output
  }

  const currentSlots = input.historicalLane.length
    ? Math.min(input.currentLane.length, Math.max(1, limit - 1), Math.ceil(limit / 2))
    : Math.min(input.currentLane.length, limit)
  pushUntilLimit(input.currentLane.slice(0, currentSlots))
  pushUntilLimit(input.historicalLane)
  pushUntilLimit(input.supportLane)
  pushUntilLimit(input.currentLane.slice(currentSlots))
  return output
}

function sqlEvidenceTiers(tiers: EvidenceTier[]) {
  return sql.join(
    tiers.map((tier) => sql`${tier}`),
    sql`, `,
  )
}

// ─── Phase 2: hybrid tsvector + pgvector cosine search ───────────────────────

/**
 * Hybrid search combining tsvector keyword matching and pgvector cosine
 * similarity. Weights are determined dynamically by classifyQuery().
 *
 * Combined score = (keyword_weight * ts_rank) + (semantic_weight * (1 - cosine_distance))
 */
export async function searchChunks(
  repositoryId: string,
  query: string,
  opts: SearchOptions = {},
): Promise<HybridSearchResult[]> {
  const { limit = 20, chunkType, programmingLanguage, embeddingOptions } = opts
  const policy = opts.retrievalPolicy ?? classifyRetrievalIntent(query)
  const { keyword, semantic } = classifyQuery(query)

  // Normalise weights to 0..1 range
  const total = keyword + semantic
  const kw = keyword / total
  const sem = semantic / total

  const queryVector = await embedQuery(query, embeddingOptions)
  // pgvector literal format: '[0.1,0.2,...]'
  const vectorLiteral = `[${queryVector.join(',')}]`

  const chunkTypeFilter = chunkType ? sql`AND c.chunk_type = ${chunkType}` : sql``
  const langFilter = programmingLanguage
    ? sql`AND d.programming_language = ${programmingLanguage}`
    : sql``

  async function queryLane(
    tiers: EvidenceTier[],
    lane: RetrievalLane,
  ): Promise<HybridSearchResult[]> {
    if (tiers.length === 0) return []
    const rows = await db.execute(sql`
      SELECT
        c.id                    AS "chunkId",
        c.document_id           AS "documentId",
        d.path                  AS "path",
        c.start_line            AS "startLine",
        c.end_line              AS "endLine",
        c.chunk_type            AS "chunkType",
        c.content               AS "content",
        COALESCE(ts_rank(c.search_vector, plainto_tsquery('english', ${query})), 0) AS "keywordRank",
        GREATEST(0, LEAST(1, COALESCE(1 - (c.embedding <=> ${vectorLiteral}::vector), 0))) AS "semanticScore",
        d.evidence_tier AS "evidenceTier",
        d.evidence_kind AS "evidenceKind",
        d.evidence_alignment_status AS "evidenceAlignmentStatus"
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      JOIN branches b  ON b.id = d.branch_id
      WHERE b.repository_id = ${repositoryId}
        AND c.embedding IS NOT NULL
        AND (d.evidence_tier IN (${sqlEvidenceTiers(tiers)}) OR d.evidence_tier IS NULL)
        ${chunkTypeFilter}
        ${langFilter}
      ORDER BY (
        ${sql.raw(String(kw))} * COALESCE(ts_rank(c.search_vector, plainto_tsquery('english', ${query})), 0)
        +
        ${sql.raw(String(sem))} * COALESCE(1 - (c.embedding <=> ${vectorLiteral}::vector), 0)
      ) DESC
      LIMIT ${Math.max(limit * 6, limit)}
    `)

    return (rows as unknown as HybridSearchRow[])
      .map((row): HybridSearchResult | null => {
        const evidenceMetadata = resolveEvidenceMetadataForPath({
          path: row.path,
          evidenceTier: row.evidenceTier,
          evidenceKind: row.evidenceKind,
          evidenceAlignmentStatus: row.evidenceAlignmentStatus,
        })
        if (!evidenceMetadata || !tiers.includes(evidenceMetadata.evidenceTier)) return null

        const normalizedHybridScore = normalizeHybridScore({
          keywordRank: Number(row.keywordRank ?? 0),
          semanticScore: Number(row.semanticScore ?? 0),
          keywordWeight: kw,
          semanticWeight: sem,
        })
        return {
          chunkId: row.chunkId,
          documentId: row.documentId,
          path: row.path,
          startLine: row.startLine,
          endLine: row.endLine,
          chunkType: row.chunkType,
          content: row.content,
          score: normalizedHybridScore,
          normalizedHybridScore,
          evidenceTier: evidenceMetadata.evidenceTier,
          evidenceKind: evidenceMetadata.evidenceKind,
          evidenceAlignmentStatus: evidenceMetadata.evidenceAlignmentStatus,
          retrievalIntent: policy.intent,
          retrievalLane: lane,
        }
      })
      .filter((result): result is HybridSearchResult => result !== null)
  }

  const currentLane = applyAuthorityRanking(await queryLane(policy.currentTiers, 'current'))
  const fallbackLane = hasAcceptedResult(currentLane)
    ? []
    : applyAuthorityRanking(await queryLane(policy.currentFallbackTiers, 'fallback'))

  if (policy.historicalContextEnabled) {
    const historicalLane = applyAuthorityRanking(
      await queryLane(policy.historicalTiers, 'historical'),
    )
    const supportLane = applyAuthorityRanking(await queryLane(policy.supportTiers, 'support'))
    return composeRetrievalResults({
      policy,
      currentLane,
      fallbackLane,
      historicalLane,
      supportLane,
      limit,
    })
  }

  return composeRetrievalResults({
    policy,
    currentLane,
    fallbackLane,
    historicalLane: [],
    supportLane: [],
    limit,
  })
}
