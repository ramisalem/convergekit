import { branches, chatSessions, db, documents, INTERNAL_DOCUMENT_PATHS } from '@convergekit/db'
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'

export type RepositoryListSummary = {
  chatCount: number
  indexedAt: string | null
  loc: number
  primaryLanguage: string | null
}

type BranchSummaryRow = {
  indexedAt: Date | string | null
  repositoryId: string
}

type DocumentSummaryRow = {
  loc: number | string | null
  repositoryId: string
}

type LanguageSummaryRow = {
  documentCount: number | string
  primaryLanguage: string | null
  repositoryId: string
}

type ChatSummaryRow = {
  chatCount: number | string
  repositoryId: string
}

function emptySummary(): RepositoryListSummary {
  return {
    chatCount: 0,
    indexedAt: null,
    loc: 0,
    primaryLanguage: null,
  }
}

function toCount(value: number | string | null | undefined) {
  if (value === null || value === undefined) return 0
  return typeof value === 'number' ? value : Number.parseInt(value, 10)
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function attachRepositoryListSummaries<T extends { id: string }>(
  repositories: T[],
  summaries: ReadonlyMap<string, RepositoryListSummary>,
): Array<T & { listSummary: RepositoryListSummary }> {
  return repositories.map((repository) => ({
    ...repository,
    listSummary: summaries.get(repository.id) ?? emptySummary(),
  }))
}

type RepositoryListSummaryRows = {
  branchRows: BranchSummaryRow[]
  documentRows: DocumentSummaryRow[]
  languageRows: LanguageSummaryRow[]
  chatRows: ChatSummaryRow[]
}

/**
 * Pure reducer: fold the four aggregate row sets into one summary per requested
 * repository. Kept separate from the database access so the (branch-heavy)
 * merge and language tie-break logic is unit-testable without a live database.
 */
export function buildRepositoryListSummaries(
  repositoryIds: string[],
  rows: RepositoryListSummaryRows,
): Map<string, RepositoryListSummary> {
  const summaries = new Map<string, RepositoryListSummary>(
    [...new Set(repositoryIds)].map((repositoryId) => [repositoryId, emptySummary()]),
  )

  for (const row of rows.branchRows) {
    const summary = summaries.get(row.repositoryId)
    if (summary) summary.indexedAt = toIsoString(row.indexedAt)
  }

  for (const row of rows.documentRows) {
    const summary = summaries.get(row.repositoryId)
    if (summary) summary.loc = toCount(row.loc)
  }

  const primaryLanguageByRepository = new Map<string, { count: number; language: string }>()
  for (const row of rows.languageRows) {
    if (!row.primaryLanguage) continue
    const count = toCount(row.documentCount)
    const current = primaryLanguageByRepository.get(row.repositoryId)
    if (
      !current ||
      count > current.count ||
      (count === current.count && row.primaryLanguage < current.language)
    ) {
      primaryLanguageByRepository.set(row.repositoryId, {
        count,
        language: row.primaryLanguage,
      })
    }
  }
  for (const [repositoryId, value] of primaryLanguageByRepository) {
    const summary = summaries.get(repositoryId)
    if (summary) summary.primaryLanguage = value.language
  }

  for (const row of rows.chatRows) {
    const summary = summaries.get(row.repositoryId)
    if (summary) summary.chatCount = toCount(row.chatCount)
  }

  return summaries
}

export async function getRepositoryListSummaries(
  repositoryIds: string[],
): Promise<Map<string, RepositoryListSummary>> {
  const uniqueRepositoryIds = [...new Set(repositoryIds)]
  if (uniqueRepositoryIds.length === 0) return new Map()

  const [branchRows, documentRows, languageRows, chatRows] = await Promise.all([
    db
      .select({
        repositoryId: branches.repositoryId,
        indexedAt: sql<Date | null>`max(${branches.lastIndexedAt})`,
      })
      .from(branches)
      .where(inArray(branches.repositoryId, uniqueRepositoryIds))
      .groupBy(branches.repositoryId),
    db
      .select({
        repositoryId: branches.repositoryId,
        loc: sql<number>`coalesce(sum(${documents.lineCount}), 0)::int`,
      })
      .from(documents)
      .innerJoin(branches, eq(documents.branchId, branches.id))
      .where(
        and(
          inArray(branches.repositoryId, uniqueRepositoryIds),
          notInArray(documents.path, INTERNAL_DOCUMENT_PATHS),
        ),
      )
      .groupBy(branches.repositoryId),
    db
      .select({
        repositoryId: branches.repositoryId,
        primaryLanguage: documents.programmingLanguage,
        documentCount: sql<number>`count(*)::int`,
      })
      .from(documents)
      .innerJoin(branches, eq(documents.branchId, branches.id))
      .where(
        and(
          inArray(branches.repositoryId, uniqueRepositoryIds),
          notInArray(documents.path, INTERNAL_DOCUMENT_PATHS),
          sql`${documents.programmingLanguage} is not null`,
        ),
      )
      .groupBy(branches.repositoryId, documents.programmingLanguage),
    db
      .select({
        repositoryId: chatSessions.repositoryId,
        chatCount: sql<number>`count(*)::int`,
      })
      .from(chatSessions)
      .where(inArray(chatSessions.repositoryId, uniqueRepositoryIds))
      .groupBy(chatSessions.repositoryId),
  ])

  return buildRepositoryListSummaries(uniqueRepositoryIds, {
    branchRows: branchRows as BranchSummaryRow[],
    documentRows: documentRows as DocumentSummaryRow[],
    languageRows: languageRows as LanguageSummaryRow[],
    chatRows: chatRows as ChatSummaryRow[],
  })
}
