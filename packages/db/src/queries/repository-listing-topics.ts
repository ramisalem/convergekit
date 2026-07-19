import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { db } from '../client.js'
import { branches, documents, repositories, wikiPages } from '../schema.js'

const MINDMAP_PATH = '__mindmap__'
// Mirrors INTERNAL_DOCUMENT_PATHS in ./index.ts; kept local to avoid a circular
// import (index.ts re-exports this module).
const EXCLUDED_LANGUAGE_PATHS = [MINDMAP_PATH]
export const TOPICS_LIMIT = 20

export type RepresentativeBranchRow = {
  repositoryId: string
  branchId: string
  branchName: string
  defaultBranch: string
  lastIndexedAt: Date | string | null
}

export type MindMapRow = { repositoryId: string; content: string | null }
export type WikiTitleRow = {
  repositoryId: string
  title: string
  isSection: boolean
  orderIndex: number
}

export type RepositoryListingTopics = { description: string | null; topics: string[] }

type MindMapNode = { name?: string; description?: string; children?: MindMapNode[] }

function indexedTime(value: Date | string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time
}

/**
 * Deterministic representative branch per repo:
 *   last_indexed_at DESC NULLS LAST, (name = default_branch) DESC, id ASC.
 * Pure so the tiebreak is unit-testable without a live database.
 */
export function pickRepresentativeBranchIds(rows: RepresentativeBranchRow[]): Map<string, string> {
  const byRepo = new Map<string, RepresentativeBranchRow>()
  for (const row of rows) {
    const current = byRepo.get(row.repositoryId)
    if (!current || isBetterBranch(row, current)) byRepo.set(row.repositoryId, row)
  }
  return new Map([...byRepo.entries()].map(([repositoryId, row]) => [repositoryId, row.branchId]))
}

function isBetterBranch(a: RepresentativeBranchRow, b: RepresentativeBranchRow): boolean {
  const aTime = indexedTime(a.lastIndexedAt)
  const bTime = indexedTime(b.lastIndexedAt)
  // Direct compare (not subtraction) so two NEGATIVE_INFINITY times stay equal
  // instead of producing NaN and falling through to the wrong branch.
  if (aTime !== bTime) return aTime > bTime
  const aDefault = a.branchName === a.defaultBranch
  const bDefault = b.branchName === b.defaultBranch
  if (aDefault !== bDefault) return aDefault
  return a.branchId < b.branchId
}

function parseMindMap(content: string | null): { description: string | null; areas: string[] } {
  if (!content) return { description: null, areas: [] }
  try {
    const root = JSON.parse(content) as MindMapNode
    // Truthy fallback (not nullish): an empty-string description should fall
    // through to the root name, not surface as a blank description.
    const description = root.description || root.name || null
    const areas = (root.children ?? [])
      .map((child) => child.name)
      .filter((name): name is string => Boolean(name))
    return { description, areas }
  } catch {
    return { description: null, areas: [] }
  }
}

function capUnique(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
    if (out.length >= TOPICS_LIMIT) break
  }
  return out
}

/**
 * Fold representative-branch mind-map + repo-scoped wiki-title rows into one
 * summary per requested repo. Pure; the caller resolves the representative
 * mind-map branch first (wiki rows are already keyed by repository).
 */
export function buildRepositoryListingTopics(
  repositoryIds: string[],
  rows: { mindMapRows: MindMapRow[]; wikiTitleRows: WikiTitleRow[] },
): Map<string, RepositoryListingTopics> {
  const result = new Map<string, RepositoryListingTopics>(
    [...new Set(repositoryIds)].map((id) => [id, { description: null, topics: [] }]),
  )

  const mindMapByRepo = new Map<string, { description: string | null; areas: string[] }>()
  for (const row of rows.mindMapRows) {
    mindMapByRepo.set(row.repositoryId, parseMindMap(row.content))
  }

  const wikiByRepo = new Map<string, WikiTitleRow[]>()
  for (const row of rows.wikiTitleRows) {
    wikiByRepo.set(row.repositoryId, [...(wikiByRepo.get(row.repositoryId) ?? []), row])
  }

  for (const id of result.keys()) {
    const mindMap = mindMapByRepo.get(id)
    const wikiRows = (wikiByRepo.get(id) ?? [])
      .slice()
      .sort((a, b) => Number(b.isSection) - Number(a.isSection) || a.orderIndex - b.orderIndex)
    const wikiTitles = wikiRows.map((row) => row.title)
    const topics = wikiTitles.length > 0 ? capUnique(wikiTitles) : capUnique(mindMap?.areas ?? [])
    result.set(id, { description: mindMap?.description ?? null, topics })
  }

  return result
}

export async function getRepositoryListingTopicsByIds(
  ids: string[],
): Promise<Map<string, RepositoryListingTopics>> {
  const uniqueIds = [...new Set(ids)]
  if (uniqueIds.length === 0) return new Map()

  // Mind map is branch-scoped (documents unique per (branch_id, path)): fetch the
  // docs that EXIST joined to their branch, then disambiguate by recency below.
  // Wiki is repo-scoped (unique (repository_id, slug); branch_id is stale and never
  // updated on regeneration) — query by repository_id, never branch_id.
  const [mindMapDocRows, wikiRows] = await Promise.all([
    db
      .select({
        repositoryId: branches.repositoryId,
        branchId: branches.id,
        branchName: branches.name,
        defaultBranch: repositories.defaultBranch,
        lastIndexedAt: branches.lastIndexedAt,
        content: documents.content,
      })
      .from(documents)
      .innerJoin(branches, eq(documents.branchId, branches.id))
      .innerJoin(repositories, eq(repositories.id, branches.repositoryId))
      .where(and(inArray(branches.repositoryId, uniqueIds), eq(documents.path, MINDMAP_PATH))),
    db
      .select({
        repositoryId: wikiPages.repositoryId,
        title: wikiPages.title,
        parentSlug: wikiPages.parentSlug,
        orderIndex: wikiPages.orderIndex,
      })
      .from(wikiPages)
      .where(and(inArray(wikiPages.repositoryId, uniqueIds), eq(wikiPages.status, 'done'))),
  ])

  // Among branches that actually have a mind map, keep the most-recently-indexed one per repo.
  const representativeMindMapBranchIds = new Set(
    pickRepresentativeBranchIds(
      mindMapDocRows.map((row) => ({
        repositoryId: row.repositoryId,
        branchId: row.branchId,
        branchName: row.branchName,
        defaultBranch: row.defaultBranch,
        lastIndexedAt: row.lastIndexedAt,
      })),
    ).values(),
  )
  const mindMapRows: MindMapRow[] = mindMapDocRows
    .filter((row) => representativeMindMapBranchIds.has(row.branchId))
    .map((row) => ({ repositoryId: row.repositoryId, content: row.content }))

  const wikiTitleRows: WikiTitleRow[] = wikiRows.map((row) => ({
    repositoryId: row.repositoryId,
    title: row.title,
    isSection: row.parentSlug === null,
    orderIndex: row.orderIndex,
  }))

  return buildRepositoryListingTopics(uniqueIds, { mindMapRows, wikiTitleRows })
}

export type LanguageCountRow = {
  repositoryId: string
  programmingLanguage: string | null
  documentCount: number | string
}

/**
 * Most-common programming language per repo: highest document count wins, ties
 * broken alphabetically (matches buildRepositoryListSummaries). Pure so the
 * tie-break is unit-testable without a live database.
 */
export function pickPrimaryLanguages(rows: LanguageCountRow[]): Map<string, string> {
  const best = new Map<string, { count: number; language: string }>()
  for (const row of rows) {
    if (!row.programmingLanguage) continue
    const count =
      typeof row.documentCount === 'number'
        ? row.documentCount
        : Number.parseInt(row.documentCount, 10)
    const current = best.get(row.repositoryId)
    if (
      !current ||
      count > current.count ||
      (count === current.count && row.programmingLanguage < current.language)
    ) {
      best.set(row.repositoryId, { count, language: row.programmingLanguage })
    }
  }
  return new Map([...best.entries()].map(([id, value]) => [id, value.language]))
}

/**
 * Lean primary-language lookup for the MCP repository listing: one grouped
 * documents aggregate, avoiding the three extra metrics computed by
 * getRepositoryListSummaries (which the agent-facing list does not use).
 */
export async function getPrimaryLanguagesByIds(ids: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids)]
  if (uniqueIds.length === 0) return new Map()
  const rows = await db
    .select({
      repositoryId: branches.repositoryId,
      programmingLanguage: documents.programmingLanguage,
      documentCount: sql<number>`count(*)::int`,
    })
    .from(documents)
    .innerJoin(branches, eq(documents.branchId, branches.id))
    .where(
      and(
        inArray(branches.repositoryId, uniqueIds),
        notInArray(documents.path, EXCLUDED_LANGUAGE_PATHS),
        sql`${documents.programmingLanguage} is not null`,
      ),
    )
    .groupBy(branches.repositoryId, documents.programmingLanguage)
  return pickPrimaryLanguages(rows as LanguageCountRow[])
}
