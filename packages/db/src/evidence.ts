import type { RetrievalIntent } from '@convergekit/types'
import { extname } from 'node:path'

export type { RetrievalIntent } from '@convergekit/types'

export const DEFAULT_MAX_INDEX_FILE_BYTES = 512 * 1024

export type EvidenceTier = 'A' | 'B' | 'C' | 'D'
export type EvidenceKind =
  | 'code'
  | 'test'
  | 'config'
  | 'migration'
  | 'infra'
  | 'readme'
  | 'setup_doc'
  | 'api_doc'
  | 'adr'
  | 'design_doc'
  | 'plan'
export type EvidenceAlignmentStatus = 'unverified' | 'aligned' | 'stale' | 'conflicts'
export type FileSkipReason = 'unsupported-extension' | 'oversized' | 'generated' | 'noise'

export type IndexableFileDecision =
  | {
      index: true
      evidenceTier: EvidenceTier
      evidenceKind: EvidenceKind
      searchByDefault: boolean
      indexDecisionReason: string
    }
  | {
      index: false
      reason: FileSkipReason
      detail: string
    }

export type ResolvedEvidenceMetadata = {
  evidenceTier: EvidenceTier
  evidenceKind: EvidenceKind | string | null
  evidenceAlignmentStatus: EvidenceAlignmentStatus
}

export type SkippedRepositoryFile = {
  path: string
  reason: Exclude<FileSkipReason, 'unsupported-extension'>
  detail: string
  sizeBytes: number
}

export const SUPPORTED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.cc',
  '.h',
  '.hpp',
  '.cs',
  '.rb',
  '.tf',
  '.tfvars',
  '.php',
  '.swift',
  '.kt',
  '.scala',
  '.r',
  '.lua',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.env',
  '.md',
  '.mdx',
  '.txt',
  '.rst',
  '.html',
  '.css',
  '.scss',
  '.sql',
])

const TIER_A = { evidenceTier: 'A', searchByDefault: true } as const
const TIER_B = { evidenceTier: 'B', searchByDefault: true } as const
const TIER_C = { evidenceTier: 'C', searchByDefault: false } as const
const TIER_D = { evidenceTier: 'D', searchByDefault: false } as const

const GENERATED_PATHS: Record<string, string> = {
  'db/structure.sql': 'generated database schema dump',
  'public/css/google_fonts.css': 'generated font stylesheet',
  'swagger/duplicate.json': 'generated duplicate Swagger export',
}

const GENERATED_PATTERNS: Array<{ pattern: RegExp; detail: string }> = [
  { pattern: /(^|\/)[^/]+\.min\.(css|js)$/i, detail: 'minified build artifact' },
  {
    pattern: /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb)$/i,
    detail: 'lockfile',
  },
  { pattern: /(^|\/)(coverage|dist|build|target|vendor)\//, detail: 'generated output' },
  { pattern: /(^|\/)\.next\//, detail: 'generated framework output' },
  { pattern: /(^|\/)(docs|api-docs)\/generated\//, detail: 'generated documentation' },
  {
    pattern: /(^|\/)(site|storybook-static|typedoc|jsdoc)\//,
    detail: 'generated documentation site',
  },
]

const SKIPPED_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  'dist',
  'build',
  '.next',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache',
  'target',
  'vendor',
  '.turbo',
  'coverage',
  '.cache',
  '.venv',
  '.hg',
  '.nuxt',
  '.vite',
  '.parcel-cache',
  '.tox',
  '.ruff_cache',
  '.idea',
  '.vscode',
])

const ALLOWED_EXTENSIONLESS_FILES = new Set([
  '.dockerignore',
  '.editorconfig',
  '.nvmrc',
  '.node-version',
  '.ruby-version',
  '.python-version',
  '.tool-versions',
  '.prettierrc',
  '.eslintrc',
  '.github/CODEOWNERS',
])

type IndexedDecision = Extract<IndexableFileDecision, { index: true }>

type IndexRule = {
  priority: number
  pattern: RegExp
  patternText: string
  decision: IndexedDecision | ((path: string) => IndexedDecision)
}

function rule(
  priority: number,
  patternText: string,
  pattern: RegExp,
  decision: IndexRule['decision'],
): IndexRule {
  return { priority, patternText, pattern, decision }
}

export function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '')
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function getMaxIndexFileBytes(env: NodeJS.ProcessEnv = process.env): number {
  return parsePositiveInt(env.MAX_INDEX_FILE_BYTES, DEFAULT_MAX_INDEX_FILE_BYTES)
}

function pathSegments(path: string): string[] {
  return normalizeRepoPath(path).split('/').filter(Boolean)
}

function isAllowedHiddenPath(path: string): boolean {
  const normalizedPath = normalizeRepoPath(path)
  if (/^\.env(?:\.[^/]*)?$/.test(normalizedPath)) return true
  if (ALLOWED_EXTENSIONLESS_FILES.has(normalizedPath)) return true
  if (/^\.(prettierrc|eslintrc)(?:\.[^/]*)?$/.test(normalizedPath)) return true
  if (/^\.gitlab-ci\.ya?ml$/.test(normalizedPath)) return true
  if (/^\.github\/(workflows|actions)\//.test(normalizedPath)) return true
  if (/^\.github\/(dependabot\.ya?ml|CODEOWNERS)$/.test(normalizedPath)) return true
  if (/^\.circleci\//.test(normalizedPath)) return true
  if (/^\.devcontainer\//.test(normalizedPath)) return true
  return false
}

function isAllowedHiddenDirectory(path: string): boolean {
  const normalizedPath = normalizeRepoPath(path)
  if (normalizedPath === '.github') return true
  if (normalizedPath === '.github/workflows' || normalizedPath.startsWith('.github/workflows/'))
    return true
  if (normalizedPath === '.github/actions' || normalizedPath.startsWith('.github/actions/'))
    return true
  if (normalizedPath === '.circleci' || normalizedPath.startsWith('.circleci/')) return true
  if (normalizedPath === '.devcontainer' || normalizedPath.startsWith('.devcontainer/')) return true
  return false
}

function isSupportedRepositoryTextPath(path: string): boolean {
  const normalizedPath = normalizeRepoPath(path)
  const ext = extname(normalizedPath).toLowerCase()
  if (SUPPORTED_EXTENSIONS.has(ext)) return true
  if (ALLOWED_EXTENSIONLESS_FILES.has(normalizedPath)) return true
  if (/^\.(prettierrc|eslintrc)(?:\.[^/]*)?$/.test(normalizedPath)) return true
  if (/^\.env(?:\.[^/]*)?$/.test(normalizedPath)) return true
  if (/(^|\/)Dockerfile[^/]*$/.test(normalizedPath)) return true
  return false
}

export function shouldSkipRepositoryDirectory(path: string): boolean {
  const normalizedPath = normalizeRepoPath(path)
  const segments = pathSegments(normalizedPath)
  const name = segments.at(-1) ?? normalizedPath

  if (isAllowedHiddenDirectory(normalizedPath)) {
    return false
  }
  if (normalizedPath.startsWith('.github/')) {
    return true
  }
  if (SKIPPED_DIRS.has(normalizedPath) || SKIPPED_DIRS.has(name)) {
    return true
  }
  return name.startsWith('.')
}

function shouldSkipPathForNoise(path: string): IndexableFileDecision | null {
  const normalizedPath = normalizeRepoPath(path)
  const segments = pathSegments(path)
  const hiddenSegment = segments.find((segment) => segment.startsWith('.'))
  if (hiddenSegment) {
    if (isAllowedHiddenPath(normalizedPath)) return null
    return { index: false, reason: 'noise', detail: `hidden directory or file: ${hiddenSegment}` }
  }
  const skippedSegment = segments.find((segment) => SKIPPED_DIRS.has(segment))
  if (skippedSegment) {
    return {
      index: false,
      reason: 'generated',
      detail: `generated or dependency directory: ${skippedSegment}`,
    }
  }
  return null
}

function currentTruthDecision(path: string): IndexedDecision {
  if (/(^|\/)(migrations|db\/migrate|prisma\/migrations|alembic)\//.test(path)) {
    return {
      index: true,
      ...TIER_A,
      evidenceKind: 'migration',
      indexDecisionReason: 'current:migration',
    }
  }
  if (/(^|\/)config\//.test(path) || /(^|\/)[^/]+\.config\.[^.]+$/.test(path)) {
    return {
      index: true,
      ...TIER_A,
      evidenceKind: 'config',
      indexDecisionReason: 'current:runtime-config',
    }
  }
  return { index: true, ...TIER_A, evidenceKind: 'code', indexDecisionReason: 'current:source' }
}

const INDEX_RULES: IndexRule[] = [
  rule(90, '.github/workflows/**', /^\.github\/workflows\//, {
    index: true,
    ...TIER_A,
    evidenceKind: 'infra',
    indexDecisionReason: 'current:ci-workflow',
  }),
  rule(90, '.github/actions/**', /^\.github\/actions\//, {
    index: true,
    ...TIER_A,
    evidenceKind: 'infra',
    indexDecisionReason: 'current:github-action',
  }),
  rule(90, '.github/dependabot.yml', /^\.github\/dependabot\.ya?ml$/i, {
    index: true,
    ...TIER_A,
    evidenceKind: 'infra',
    indexDecisionReason: 'current:dependabot',
  }),
  rule(90, '.github/CODEOWNERS', /^\.github\/CODEOWNERS$/, {
    index: true,
    ...TIER_A,
    evidenceKind: 'config',
    indexDecisionReason: 'current:codeowners',
  }),
  rule(90, '.circleci/**', /^\.circleci\//, {
    index: true,
    ...TIER_A,
    evidenceKind: 'infra',
    indexDecisionReason: 'current:ci-workflow',
  }),
  rule(90, '.devcontainer/**', /^\.devcontainer\//, {
    index: true,
    ...TIER_A,
    evidenceKind: 'infra',
    indexDecisionReason: 'current:devcontainer',
  }),
  rule(90, 'Dockerfile*', /(^|\/)Dockerfile[^/]*$/, {
    index: true,
    ...TIER_A,
    evidenceKind: 'infra',
    indexDecisionReason: 'current:docker',
  }),
  rule(90, 'docker-compose*', /(^|\/)docker-compose[^/]*$/i, {
    index: true,
    ...TIER_A,
    evidenceKind: 'infra',
    indexDecisionReason: 'current:compose',
  }),
  rule(90, '.gitlab-ci.yml', /^\.gitlab-ci\.ya?ml$/i, {
    index: true,
    ...TIER_A,
    evidenceKind: 'infra',
    indexDecisionReason: 'current:gitlab-ci',
  }),
  rule(90, '.env*', /(^|\/)\.env(?:\.[^/]*)?$/, {
    index: true,
    ...TIER_A,
    evidenceKind: 'config',
    indexDecisionReason: 'current:env-example',
  }),
  rule(
    90,
    'hidden root config files',
    /^\.(dockerignore|editorconfig|nvmrc|node-version|ruby-version|python-version|tool-versions|prettierrc|eslintrc)(?:\.[^/]*)?$/i,
    {
      index: true,
      ...TIER_A,
      evidenceKind: 'config',
      indexDecisionReason: 'current:hidden-config',
    },
  ),
  rule(90, 'infra paths', /(^|\/)(helm|terraform|infra)\//, {
    index: true,
    ...TIER_A,
    evidenceKind: 'infra',
    indexDecisionReason: 'current:infra',
  }),

  rule(80, 'docs/superpowers/specs/**', /^docs\/superpowers\/specs\//, {
    index: true,
    ...TIER_D,
    evidenceKind: 'design_doc',
    indexDecisionReason: 'historical:superpowers-spec',
  }),
  rule(80, 'docs/superpowers/plans/**', /^docs\/superpowers\/plans\//, {
    index: true,
    ...TIER_D,
    evidenceKind: 'plan',
    indexDecisionReason: 'historical:superpowers-plan',
  }),
  rule(80, '**/adr/**', /(^|\/)adr\//, {
    index: true,
    ...TIER_D,
    evidenceKind: 'adr',
    indexDecisionReason: 'historical:adr',
  }),
  rule(80, '**/*design*.md', /(^|\/)[^/]*design[^/]*\.mdx?$/i, {
    index: true,
    ...TIER_D,
    evidenceKind: 'design_doc',
    indexDecisionReason: 'historical:design-doc',
  }),
  rule(80, '**/*plan*.md', /(^|\/)[^/]*plan[^/]*\.mdx?$/i, {
    index: true,
    ...TIER_D,
    evidenceKind: 'plan',
    indexDecisionReason: 'historical:plan-doc',
  }),
  rule(80, '**/*roadmap*.md', /(^|\/)[^/]*roadmap[^/]*\.mdx?$/i, {
    index: true,
    ...TIER_D,
    evidenceKind: 'plan',
    indexDecisionReason: 'historical:roadmap',
  }),

  rule(70, '**/*.test.*', /(^|\/)[^/]+\.(test|spec)\.[^.]+$/i, {
    index: true,
    ...TIER_B,
    evidenceKind: 'test',
    indexDecisionReason: 'verification:test-file',
  }),
  rule(70, 'tests/**', /(^|\/)(test|tests|__tests__|fixtures)\//, {
    index: true,
    ...TIER_B,
    evidenceKind: 'test',
    indexDecisionReason: 'verification:test-path',
  }),

  rule(
    60,
    'current source/config paths',
    /(^|\/)(src|app|packages|lib|server|routes|workers|config|schemas?|models?|migrations|db\/migrate|prisma\/migrations|alembic)\//,
    currentTruthDecision,
  ),
  rule(
    55,
    'runtime manifests',
    /(^|\/)(package\.json|tsconfig[^/]*\.json|vite\.config\.[^.]+|next\.config\.[^.]+)$/i,
    {
      index: true,
      ...TIER_A,
      evidenceKind: 'config',
      indexDecisionReason: 'current:runtime-manifest',
    },
  ),
  rule(50, 'README*', /(^|\/)readme\.mdx?$/i, {
    index: true,
    ...TIER_C,
    evidenceKind: 'readme',
    indexDecisionReason: 'operational:readme',
  }),
  rule(
    50,
    'operational docs',
    /(^|\/)(docs\/)?(setup|deploy|deployment|contributing|security|runbook|api)[^/]*\.mdx?$/i,
    {
      index: true,
      ...TIER_C,
      evidenceKind: 'setup_doc',
      indexDecisionReason: 'operational:doc',
    },
  ),
]

function matchIndexRule(path: string): IndexedDecision | null {
  const matches = INDEX_RULES.filter((candidate) => candidate.pattern.test(path)).sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority
    return b.patternText.length - a.patternText.length
  })
  const matched = matches[0]
  if (!matched) return null
  return typeof matched.decision === 'function' ? matched.decision(path) : matched.decision
}

function defaultSupportedDecision(path: string): IndexedDecision {
  const ext = extname(path).toLowerCase()
  if (ext === '.md' || ext === '.mdx' || ext === '.txt' || ext === '.rst') {
    return {
      index: true,
      ...TIER_C,
      evidenceKind: 'setup_doc',
      indexDecisionReason: 'operational:general-doc',
    }
  }
  return currentTruthDecision(path)
}

export function classifyRepositoryFile(
  path: string,
  sizeBytes: number,
  options: { maxFileBytes?: number } = {},
): IndexableFileDecision {
  const normalizedPath = normalizeRepoPath(path)
  const generatedDetail = GENERATED_PATHS[normalizedPath]

  if (generatedDetail) {
    return { index: false, reason: 'generated', detail: generatedDetail }
  }

  for (const { pattern, detail } of GENERATED_PATTERNS) {
    if (pattern.test(normalizedPath)) {
      return { index: false, reason: 'generated', detail }
    }
  }

  const noiseDecision = shouldSkipPathForNoise(normalizedPath)
  if (noiseDecision) return noiseDecision

  const maxFileBytes = options.maxFileBytes ?? getMaxIndexFileBytes()
  if (sizeBytes > maxFileBytes) {
    return {
      index: false,
      reason: 'oversized',
      detail: `file is larger than ${maxFileBytes} bytes`,
    }
  }

  if (!isSupportedRepositoryTextPath(normalizedPath)) {
    const ext = extname(normalizedPath).toLowerCase()
    return {
      index: false,
      reason: 'unsupported-extension',
      detail: `unsupported extension: ${ext || '<none>'}`,
    }
  }

  const ruleDecision = matchIndexRule(normalizedPath)
  if (ruleDecision) return ruleDecision

  return defaultSupportedDecision(normalizedPath)
}

export function resolveEvidenceMetadataForPath(input: {
  path: string
  evidenceTier: EvidenceTier | null
  evidenceKind: string | null
  evidenceAlignmentStatus: EvidenceAlignmentStatus | null
}): ResolvedEvidenceMetadata | null {
  const decision =
    input.evidenceTier === null || input.evidenceKind === null
      ? classifyRepositoryFile(input.path, 0, { maxFileBytes: Number.MAX_SAFE_INTEGER })
      : null

  if (input.evidenceTier === null && (!decision || !decision.index)) {
    return null
  }

  return {
    evidenceTier: input.evidenceTier ?? (decision as IndexedDecision).evidenceTier,
    evidenceKind: input.evidenceKind ?? (decision && decision.index ? decision.evidenceKind : null),
    evidenceAlignmentStatus: input.evidenceAlignmentStatus ?? 'unverified',
  }
}

export function summarizeSkippedFiles(skipped: SkippedRepositoryFile[]): {
  total: number
  byReason: Partial<Record<SkippedRepositoryFile['reason'], number>>
} {
  return skipped.reduce(
    (summary, file) => {
      summary.total += 1
      summary.byReason[file.reason] = (summary.byReason[file.reason] ?? 0) + 1
      return summary
    },
    { total: 0, byReason: {} as Partial<Record<SkippedRepositoryFile['reason'], number>> },
  )
}

export type RetrievalPolicy = {
  intent: RetrievalIntent
  currentTiers: EvidenceTier[]
  currentFallbackTiers: EvidenceTier[]
  historicalTiers: Extract<EvidenceTier, 'D'>[]
  supportTiers: Extract<EvidenceTier, 'C'>[]
  historicalContextEnabled: boolean
}

export function classifyRetrievalIntent(message: string): RetrievalPolicy {
  const q = message.toLowerCase()
  const historical =
    /\b(design|plan|roadmap|adr|decision record|rationale|history|historical|originally|proposal|proposed)\b/.test(
      q,
    ) ||
    /\bwhy\s+did\s+we\s+(choose|decide|design|build|use|introduce|adopt)\b/.test(q) ||
    /\bwhy\s+(was|were)\b.+\bdesigned\b/.test(q)
  const troubleshooting =
    /\b(error|exception|fail|failing|broken|debug|trace|stack|why is .*failing|why does .*fail)\b/.test(
      q,
    )
  const operational =
    /\b(install|setup|run|start|build|deploy|docker|compose|env|configure|contribute|security|local dev)\b/.test(
      q,
    )
  const apiSchema =
    /\b(api|route|endpoint|schema|table|migration|model|type|payload|contract)\b/.test(q)

  if (historical && !troubleshooting) {
    return {
      intent: 'historical',
      currentTiers: ['A', 'B'],
      currentFallbackTiers: [],
      historicalTiers: ['D'],
      supportTiers: ['C'],
      historicalContextEnabled: true,
    }
  }
  if (troubleshooting) {
    return {
      intent: 'troubleshooting',
      currentTiers: ['A', 'B'],
      currentFallbackTiers: ['C'],
      historicalTiers: [],
      supportTiers: [],
      historicalContextEnabled: false,
    }
  }
  if (operational) {
    return {
      intent: 'operational',
      currentTiers: ['C', 'A'],
      currentFallbackTiers: ['B'],
      historicalTiers: [],
      supportTiers: [],
      historicalContextEnabled: false,
    }
  }
  if (apiSchema) {
    return {
      intent: 'api_schema',
      currentTiers: ['A', 'B'],
      currentFallbackTiers: ['C'],
      historicalTiers: [],
      supportTiers: [],
      historicalContextEnabled: false,
    }
  }
  return {
    intent: 'current_code',
    currentTiers: ['A', 'B'],
    currentFallbackTiers: ['C'],
    historicalTiers: [],
    supportTiers: [],
    historicalContextEnabled: false,
  }
}

export function normalizeHybridScore(input: {
  keywordRank: number
  semanticScore: number
  keywordWeight: number
  semanticWeight: number
}) {
  const boundedKeyword = input.keywordRank <= 0 ? 0 : input.keywordRank / (input.keywordRank + 1)
  const boundedSemantic = Math.max(0, Math.min(1, input.semanticScore))
  const totalWeight = input.keywordWeight + input.semanticWeight
  if (totalWeight <= 0) return 0
  const score =
    (input.keywordWeight / totalWeight) * boundedKeyword +
    (input.semanticWeight / totalWeight) * boundedSemantic
  return Math.max(0, Math.min(1, score))
}

export function computeAuthorityWeight(input: {
  evidenceTier: EvidenceTier
  evidenceAlignmentStatus: EvidenceAlignmentStatus | null
}): number | null {
  if (input.evidenceAlignmentStatus === 'conflicts') return null

  const base = {
    A: 1,
    B: 0.85,
    C: 0.6,
    D: 0.3,
  }[input.evidenceTier]

  const adjustment =
    input.evidenceAlignmentStatus === 'aligned'
      ? 0.15
      : input.evidenceAlignmentStatus === 'stale'
        ? -0.15
        : 0

  const adjusted = Math.max(0, base + adjustment)
  const capped = input.evidenceTier === 'D' ? Math.min(0.9, adjusted) : adjusted
  return Number(capped.toFixed(4))
}

export function applyAuthorityRanking<
  T extends {
    score: number
    normalizedHybridScore: number
    evidenceTier: EvidenceTier
    evidenceAlignmentStatus: EvidenceAlignmentStatus | null
  },
>(results: T[]): T[] {
  return results
    .map((result) => {
      const weight = computeAuthorityWeight(result)
      return weight === null ? null : { ...result, score: result.normalizedHybridScore * weight }
    })
    .filter((result): result is T => result !== null)
    .sort((a, b) => b.score - a.score)
}
