export type RepositoryDocumentStat = {
  repositoryId: string
  programmingLanguage: string | null
  fileCount: number | string
  loc: number | string | null
}

export type RepositoryBranchStat = {
  repositoryId: string
  indexedAt: Date | string | null
}

export type RepositoryChatCount = {
  repositoryId: string
  chatCount: number | string
}

export type RepositoryListSummary = {
  primaryLanguage: string | null
  loc: number | null
  chatCount: number
  indexedAt: string | null
}

type SummaryAccumulator = RepositoryListSummary & {
  languageStats: Map<string, { fileCount: number; loc: number }>
  hasDocumentStats: boolean
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function toIsoDate(value: Date | string | null) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function choosePrimaryLanguage(
  languageStats: SummaryAccumulator['languageStats'],
) {
  const [first] = [...languageStats.entries()].sort((a, b) => {
    const [, aStat] = a
    const [, bStat] = b
    if (aStat.fileCount !== bStat.fileCount) return bStat.fileCount - aStat.fileCount
    if (aStat.loc !== bStat.loc) return bStat.loc - aStat.loc
    return a[0].localeCompare(b[0], undefined, { sensitivity: 'base' })
  })

  return first?.[0] ?? null
}

export function buildRepositoryListSummaryMap({
  repositoryIds,
  documentStats,
  branchStats,
  chatCounts,
}: {
  repositoryIds: string[]
  documentStats: RepositoryDocumentStat[]
  branchStats: RepositoryBranchStat[]
  chatCounts: RepositoryChatCount[]
}) {
  const summaries = new Map<string, SummaryAccumulator>()

  for (const repositoryId of repositoryIds) {
    summaries.set(repositoryId, {
      primaryLanguage: null,
      loc: null,
      chatCount: 0,
      indexedAt: null,
      languageStats: new Map(),
      hasDocumentStats: false,
    })
  }

  for (const stat of documentStats) {
    const summary = summaries.get(stat.repositoryId)
    if (!summary) continue

    const loc = toNumber(stat.loc)
    const fileCount = toNumber(stat.fileCount)
    summary.hasDocumentStats = true
    summary.loc = (summary.loc ?? 0) + loc

    const language = stat.programmingLanguage?.trim()
    if (!language) continue

    const current = summary.languageStats.get(language) ?? { fileCount: 0, loc: 0 }
    current.fileCount += fileCount
    current.loc += loc
    summary.languageStats.set(language, current)
  }

  for (const stat of branchStats) {
    const summary = summaries.get(stat.repositoryId)
    if (!summary) continue

    const indexedAt = toIsoDate(stat.indexedAt)
    if (!indexedAt) continue

    if (!summary.indexedAt || indexedAt > summary.indexedAt) {
      summary.indexedAt = indexedAt
    }
  }

  for (const stat of chatCounts) {
    const summary = summaries.get(stat.repositoryId)
    if (!summary) continue
    summary.chatCount = toNumber(stat.chatCount)
  }

  return new Map(
    [...summaries.entries()].map(([repositoryId, summary]) => [
      repositoryId,
      {
        primaryLanguage: choosePrimaryLanguage(summary.languageStats),
        loc: summary.hasDocumentStats ? summary.loc ?? 0 : null,
        chatCount: summary.chatCount,
        indexedAt: summary.indexedAt,
      } satisfies RepositoryListSummary,
    ]),
  )
}
