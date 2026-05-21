import { resolveEvidenceMetadataForPath } from '@convergekit/db/evidence'
import type { RepositoryGuideSummary, RetrievalIntent } from '@convergekit/types'
import { and, eq, isNull } from 'drizzle-orm'

const MINDMAP_PATH = '__mindmap__'
const TIERS = ['A', 'B', 'C', 'D'] as const
const TIER_LABELS = {
  A: 'Code',
  B: 'Tests',
  C: 'Docs',
  D: 'Design/History',
} as const
const EVIDENCE_LABEL_TIERS = {
  Code: 'A',
  Tests: 'B',
  Docs: 'C',
  'Design/History': 'D',
} as const satisfies Record<
  RepositoryGuideSummary['evidenceTotals'][number]['label'],
  (typeof TIERS)[number]
>
const CONFIDENCE_SCORES = {
  'Very strong': 5,
  Strong: 4,
  'Mixed with docs': 3,
  'Gated history': 2,
  Limited: 1,
} as const satisfies Record<RepositoryGuideSummary['areas'][number]['confidenceLabel'], number>

export type GuideAreaFile = {
  path: string
  evidenceTier: 'A' | 'B' | 'C' | 'D'
  evidenceKind: string | null
}

export type GuideDocumentRow = {
  path: string
  evidenceTier: 'A' | 'B' | 'C' | 'D' | null
  evidenceKind: string | null
}

export type GuideAreaInput = {
  name: string
  files: GuideAreaFile[]
  mindMapName?: string | null
  mindMapDescription?: string | null
}

type PathRole = 'route' | 'schema' | 'migration' | 'config' | 'infra' | 'error_surface' | null
type MindMapNode = {
  name?: string
  description?: string
  files?: string[]
  children?: MindMapNode[]
}
type MindMapJobState = 'active' | 'waiting' | 'delayed' | 'prioritized' | 'failed'
type MindMapJobLike = {
  id?: string | number | null
  data?: { repositoryId?: string; branchId?: string }
}
export type MindMapQueueLike = {
  getJobs(states: MindMapJobState[]): Promise<MindMapJobLike[]>
}

export function getPathRole(path: string): PathRole {
  const normalized = path.toLowerCase()
  if (
    /(^|\/)(routes?|api|controllers?|handlers?)\//.test(normalized) ||
    /(^|\/)pages\/api\//.test(normalized)
  )
    return 'route'
  if (
    /(^|\/)(schemas?|models?|entities|types?|interfaces|proto)\//.test(normalized) ||
    /(^|\/)(openapi|swagger)[^/]*$/.test(normalized) ||
    /\.proto$/.test(normalized)
  )
    return 'schema'
  if (/(^|\/)(migrations|db\/migrate|prisma\/migrations|alembic)\//.test(normalized))
    return 'migration'
  if (
    /(^|\/)(config|\.env|[^/]+\.config\.)/.test(normalized) ||
    /(^|\/)(package\.json|pyproject\.toml|go\.mod|cargo\.toml|gemfile)$/.test(normalized)
  )
    return 'config'
  if (
    /^(\.github|\.gitlab-ci|\.circleci|\.devcontainer)\//.test(normalized) ||
    /^\.gitlab-ci\.ya?ml$/.test(normalized) ||
    /(^|\/)(dockerfile|docker-compose|terraform|helm|infra)\//.test(normalized) ||
    /(^|\/)(dockerfile|docker-compose)[^/]*$/.test(normalized)
  ) {
    return 'infra'
  }
  if (/(^|\/)(errors?|exceptions?|middlewares?|logger|logging)\//.test(normalized))
    return 'error_surface'
  return null
}

function countByTier(files: GuideAreaFile[]) {
  const counts: Record<(typeof TIERS)[number], number> = { A: 0, B: 0, C: 0, D: 0 }
  for (const file of files) counts[file.evidenceTier] += 1
  return counts
}

function hasMindMapContext(area: GuideAreaInput) {
  return Boolean(area.mindMapName || area.mindMapDescription)
}

function hasExplicitHistoricalSignal(text: string) {
  return [
    /\badr\b/,
    /\barchitectural?\s+decision\s+records?\b/,
    /\bdecision\s+records?\b/,
    /\bdesign\s+(decision|decisions|history|rationale|proposal|proposals|docs?|documents?)\b/,
    /\b(historical|history|roadmap|rationale|proposal|proposals)\b/,
    /\bwhy\s+(was|were|did|we)\b/,
  ].some((pattern) => pattern.test(text))
}

function hasTierDPathHistoricalSignal(file: GuideAreaFile) {
  const kind = file.evidenceKind ?? ''
  return (
    ['adr', 'design_doc', 'plan'].includes(kind) ||
    /(^|\/)(adr|adrs|plans?|specs?)\//i.test(file.path) ||
    /(^|\/)[^/]*(design|roadmap|rationale|decision|proposal)[^/]*\.mdx?$/i.test(file.path)
  )
}

function hasHistoricalSignal(area: GuideAreaInput) {
  const text =
    `${area.name} ${area.mindMapName ?? ''} ${area.mindMapDescription ?? ''}`.toLowerCase()
  const explicitSignal = hasExplicitHistoricalSignal(text)
  if (hasMindMapContext(area)) return explicitSignal
  return (
    explicitSignal ||
    area.files.some((file) => file.evidenceTier === 'D' && hasTierDPathHistoricalSignal(file))
  )
}

export function computeAreaIntents(
  area: GuideAreaInput,
): RepositoryGuideSummary['areas'][number]['primaryQuestionIntents'] {
  const files = area.files
  if (files.length === 0) return ['current_code']

  const tierCounts = countByTier(files)
  const tierAFiles = files.filter((file) => file.evidenceTier === 'A')
  const tierAFileCount = tierAFiles.length || 1
  const tierAPathRoleCounts = tierAFiles.reduce(
    (counts, file) => {
      const role = getPathRole(file.path)
      if (role) counts[role] += 1
      return counts
    },
    {
      route: 0,
      schema: 0,
      migration: 0,
      config: 0,
      infra: 0,
      error_surface: 0,
    } as Record<Exclude<PathRole, null>, number>,
  )
  const currentCode =
    tierAFiles.some((file) =>
      ['code', 'config', 'infra', 'migration'].includes(file.evidenceKind ?? ''),
    ) || tierCounts.B > 0
  const apiSignals = files.filter((file) => {
    return file.evidenceKind === 'migration' || file.evidenceKind === 'api_doc'
  }).length
  const apiRoleShare =
    (tierAPathRoleCounts.route + tierAPathRoleCounts.schema + tierAPathRoleCounts.migration) /
    tierAFileCount
  const operationalDocShare = tierCounts.C / files.length
  const operationalCurrentShare =
    (tierAPathRoleCounts.config + tierAPathRoleCounts.infra) / tierAFileCount
  const troubleshootingShare = tierCounts.B / files.length
  const errorSurfaceShare = tierAPathRoleCounts.error_surface / tierAFileCount

  const intents: RetrievalIntent[] = []
  if (apiRoleShare >= 0.4 || apiSignals / files.length >= 0.3) intents.push('api_schema')
  if (troubleshootingShare >= 0.2 || errorSurfaceShare >= 0.2) intents.push('troubleshooting')
  if (operationalDocShare >= 0.3 || operationalCurrentShare >= 0.3) intents.push('operational')
  if (tierCounts.D > 0 && hasHistoricalSignal(area)) intents.push('historical')
  if (currentCode || (intents.length === 0 && tierCounts.A + tierCounts.B > 0))
    intents.push('current_code')

  if (intents.length === 0) return ['current_code']
  return intents.slice(0, 3)
}

export function getAreaConfidenceLabel(
  area: GuideAreaInput,
): RepositoryGuideSummary['areas'][number]['confidenceLabel'] {
  const counts = countByTier(area.files)
  const total = area.files.length
  if (total === 0) return 'Limited'
  if (counts.D === total) return 'Gated history'
  const currentShare = (counts.A + counts.B) / total
  if (currentShare >= 0.8 && counts.A > 0 && counts.B > 0) return 'Very strong'
  if (currentShare >= 0.6) return 'Strong'
  if (counts.C > 0 || counts.D > 0) return 'Mixed with docs'
  return 'Limited'
}

function evidenceShare(
  files: GuideAreaFile[],
): RepositoryGuideSummary['areas'][number]['evidenceShare'] {
  const counts = countByTier(files)
  const total = files.length || 1
  return TIERS.map((tier) => ({
    tier,
    fileCount: counts[tier],
    percentage: Math.round((counts[tier] / total) * 100),
  }))
}

export function getAreaPathHint(area: GuideAreaInput): string | null {
  if (area.files.length === 0) return null

  const directories = area.files.map((file) => {
    const segments = file.path.split('/').filter(Boolean)
    return segments.length > 1 ? segments.slice(0, -1) : ['root']
  })
  const common = [...(directories[0] ?? [])]

  for (const directory of directories.slice(1)) {
    while (common.length > 0 && common.some((segment, index) => directory[index] !== segment)) {
      common.pop()
    }
  }

  return common.length > 0 ? common.join('/') : 'mixed paths'
}

const tierSets = {
  current_code: ['A', 'B'],
  api_schema: ['A', 'B'],
  troubleshooting: ['A', 'B'],
  operational: ['C', 'A'],
  historical: ['D'],
} as const

export function pickStrongestArea(
  areas: GuideAreaInput[],
  intent: RepositoryGuideSummary['questionStarters'][number]['intent'],
) {
  const tiers: readonly GuideAreaFile['evidenceTier'][] = tierSets[intent]
  return [...areas]
    .map((area) => ({
      area,
      relevantFiles: area.files.filter((file) => tiers.includes(file.evidenceTier)).length,
      totalFiles: area.files.length,
    }))
    .filter((item) => item.relevantFiles > 0)
    .sort((a, b) => b.relevantFiles - a.relevantFiles || b.totalFiles - a.totalFiles)[0]?.area
}

export function buildQuestionStarters(
  areas: GuideAreaInput[],
): RepositoryGuideSummary['questionStarters'] {
  const templates: Array<{
    intent: RetrievalIntent
    title: string
    evidenceLabels: RepositoryGuideSummary['questionStarters'][number]['evidenceLabels']
    prompt(area: string): string
  }> = [
    {
      intent: 'current_code',
      title: 'Ask about current behavior',
      evidenceLabels: ['Code', 'Tests'],
      prompt: (area) => `Where is ${area} implemented, and which files prove it?`,
    },
    {
      intent: 'operational',
      title: 'Ask about setup or deployment',
      evidenceLabels: ['Docs', 'Code'],
      prompt: (area) => `What configuration is needed to run or deploy ${area}?`,
    },
    {
      intent: 'api_schema',
      title: 'Ask about APIs and data shape',
      evidenceLabels: ['Code', 'Tests'],
      prompt: (area) => `What routes, schemas, or data models define ${area}?`,
    },
    {
      intent: 'troubleshooting',
      title: 'Ask about failures',
      evidenceLabels: ['Code', 'Tests'],
      prompt: (area) => `Where would I debug failures in ${area}?`,
    },
    {
      intent: 'historical',
      title: 'Ask about why or history',
      evidenceLabels: ['Design/History'],
      prompt: (area) =>
        `Why was ${area} designed this way? Separate current code from design or history docs.`,
    },
  ]

  return templates.flatMap((template) => {
    const strongest = pickStrongestArea(areas, template.intent)
    if (!strongest) return []
    return [
      {
        intent: template.intent,
        title: template.title,
        evidenceLabels: template.evidenceLabels,
        examplePrompt: template.prompt(strongest.name),
        generatedFromArea: strongest.name,
      },
    ]
  })
}

function basename(path: string) {
  return path.split('/').filter(Boolean).at(-1) ?? path
}

function evidenceSourcesForCard(
  area: GuideAreaInput,
  tiers: readonly GuideAreaFile['evidenceTier'][],
): RepositoryGuideSummary['questionCards'][number]['sources'] {
  const allowedTiers = new Set(tiers)
  const sourceMap = new Map<
    string,
    RepositoryGuideSummary['questionCards'][number]['sources'][number]
  >()

  for (const file of area.files) {
    if (!allowedTiers.has(file.evidenceTier)) continue
    const label = basename(file.path)
    const key = `${file.evidenceTier}:${label}`
    const existing = sourceMap.get(key)
    sourceMap.set(key, {
      tier: file.evidenceTier,
      label,
      count: (existing?.count ?? 0) + 1,
    })
  }

  return [...sourceMap.values()]
    .sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.label.localeCompare(b.label))
    .slice(0, 4)
}

export function buildQuestionCards(areas: GuideAreaInput[]): RepositoryGuideSummary['questionCards'] {
  const starters = buildQuestionStarters(areas)

  return starters.flatMap((starter) => {
    const area = pickStrongestArea(areas, starter.intent)
    if (!area) return []

    const routeTiers = starter.evidenceLabels.map((label) => EVIDENCE_LABEL_TIERS[label])
    const confidenceLabel = getAreaConfidenceLabel(area)
    const confidence = CONFIDENCE_SCORES[confidenceLabel]
    const primaryTier = routeTiers[0]
    const secondaryTier = routeTiers[1] ?? null
    const sources = evidenceSourcesForCard(area, routeTiers)
    const route = starter.evidenceLabels.join(' + ')
    const alignment =
      confidence <= 1 ? 'conflict' : primaryTier === 'D' || confidence <= 2 ? 'stale' : 'ok'

    return [
      {
        intent: starter.intent,
        question: starter.examplePrompt,
        confidence,
        route,
        primaryTier,
        secondaryTier,
        rationale: `${area.name} is supported by ${route.toLowerCase()} evidence across ${area.files.length} indexed files. Use this route for ${starter.title.toLowerCase()} questions.`,
        alignment,
        generatedFromArea: area.name,
        sources,
      },
    ]
  })
}

export function resolveGuideFiles(rows: GuideDocumentRow[]): {
  files: GuideAreaFile[]
  metadataStatus: RepositoryGuideSummary['metadataStatus']
} {
  let metadataStatus: RepositoryGuideSummary['metadataStatus'] = 'ready'
  const files = rows.flatMap((row): GuideAreaFile[] => {
    if (row.path === MINDMAP_PATH) return []
    const metadata = resolveEvidenceMetadataForPath({
      path: row.path,
      evidenceTier: row.evidenceTier,
      evidenceKind: row.evidenceKind,
      evidenceAlignmentStatus: null,
    })
    if (!metadata) return []
    if (row.evidenceTier === null || row.evidenceKind === null) metadataStatus = 'refreshing'
    return [
      {
        path: row.path,
        evidenceTier: metadata.evidenceTier,
        evidenceKind: metadata.evidenceKind,
      },
    ]
  })

  return { files, metadataStatus }
}

function toGuideArea(area: GuideAreaInput): RepositoryGuideSummary['areas'][number] {
  return {
    name: area.name,
    confidenceLabel: getAreaConfidenceLabel(area),
    pathHint: getAreaPathHint(area),
    evidenceShare: evidenceShare(area.files),
    primaryQuestionIntents: computeAreaIntents(area),
  }
}

function topLevelName(path: string) {
  const [first, second] = path.split('/')
  if (!second) return first
  return first === 'apps' || first === 'packages' ? `${first}/${second}` : first
}

function collectMindMapFiles(node: MindMapNode): string[] {
  return [...(node.files ?? []), ...(node.children ?? []).flatMap(collectMindMapFiles)]
}

function mindMapAreas(
  mindMapContent: string | null,
  filesByPath: Map<string, GuideAreaFile>,
): GuideAreaInput[] {
  if (!mindMapContent) return []
  try {
    const root = JSON.parse(mindMapContent) as MindMapNode
    return (root.children ?? [])
      .map((child) => ({
        name: child.name ?? 'Repository area',
        mindMapName: child.name ?? null,
        mindMapDescription: child.description ?? null,
        files: collectMindMapFiles(child)
          .map((path) => filesByPath.get(path))
          .filter((file): file is GuideAreaFile => Boolean(file)),
      }))
      .filter((area) => area.files.length > 0)
  } catch {
    return []
  }
}

function topLevelAreas(files: GuideAreaFile[]): GuideAreaInput[] {
  const groups = new Map<string, GuideAreaFile[]>()
  for (const file of files) {
    const name = topLevelName(file.path)
    groups.set(name, [...(groups.get(name) ?? []), file])
  }
  return [...groups.entries()].map(([name, files]) => ({ name, files }))
}

export async function resolveMindMapStatus(input: {
  repositoryId: string
  branchId: string | null
  repositoryStatus: RepositoryGuideSummary['status']
  hasMindMapDoc: boolean
  mindMapQueue?: MindMapQueueLike
}): Promise<RepositoryGuideSummary['mindMapStatus']> {
  if (input.hasMindMapDoc) return 'done'
  if (input.repositoryStatus === 'failed') return 'failed'
  if (input.repositoryStatus !== 'done') return input.repositoryStatus

  const queue = input.mindMapQueue ?? (await import('@convergekit/queues')).mindMapQueue
  const states: MindMapJobState[] = ['active', 'waiting', 'delayed', 'prioritized', 'failed']
  for (const state of states) {
    const jobs = await queue.getJobs([state])
    const match = jobs.find((job) => {
      if (job.id == null || String(job.id).startsWith('repeat:')) return false
      if (job.data?.repositoryId !== input.repositoryId) return false
      return !input.branchId || !job.data.branchId || job.data.branchId === input.branchId
    })
    if (!match) continue
    if (state === 'failed') return 'failed'
    if (state === 'active') return 'processing'
    return 'pending'
  }

  return 'processing'
}

export async function getRepositoryGuideSummary(
  repositoryId: string,
): Promise<RepositoryGuideSummary> {
  const { branches, db, documents, repositories } = await import('@convergekit/db')
  const repository = await db.query.repositories.findFirst({
    where: and(eq(repositories.id, repositoryId), isNull(repositories.deletedAt)),
  })
  if (!repository) throw new Error(`Repository ${repositoryId} not found`)

  const branch = await db.query.branches.findFirst({
    where: eq(branches.repositoryId, repositoryId),
  })

  if (!branch) {
    return {
      repositoryId,
      indexedAt: null,
      status: repository.status,
      mindMapStatus: null,
      metadataStatus: 'ready',
      areaSource: 'none',
      evidenceTotals: [],
      areas: [],
      questionStarters: [],
      questionCards: [],
      skippedSummary: [],
    }
  }

  const rows = await db
    .select({
      path: documents.path,
      content: documents.content,
      evidenceTier: documents.evidenceTier,
      evidenceKind: documents.evidenceKind,
    })
    .from(documents)
    .where(eq(documents.branchId, branch.id))

  const { files, metadataStatus } = resolveGuideFiles(rows)
  const filesByPath = new Map(files.map((file) => [file.path, file]))
  const mindMapDoc = rows.find((row) => row.path === MINDMAP_PATH)
  const mindMapBackedAreas = mindMapAreas(mindMapDoc?.content ?? null, filesByPath)
  const sourceAreas = mindMapBackedAreas.length > 0 ? mindMapBackedAreas : topLevelAreas(files)
  const areaSource =
    mindMapBackedAreas.length > 0 ? 'mind_map' : files.length > 0 ? 'top_level_path' : 'none'
  const totals = countByTier(files)

  return {
    repositoryId,
    indexedAt: branch.lastIndexedAt?.toISOString() ?? null,
    status: repository.status,
    mindMapStatus: await resolveMindMapStatus({
      repositoryId,
      branchId: branch.id,
      repositoryStatus: repository.status,
      hasMindMapDoc: Boolean(mindMapDoc),
    }),
    metadataStatus,
    areaSource,
    evidenceTotals: TIERS.map((tier) => ({
      tier,
      label: TIER_LABELS[tier],
      fileCount: totals[tier],
    })),
    areas: sourceAreas.map(toGuideArea),
    questionStarters: buildQuestionStarters(sourceAreas),
    questionCards: buildQuestionCards(sourceAreas),
    skippedSummary: [],
  }
}
