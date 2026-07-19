export type AnalyticsWindow = '7d' | '30d' | '90d'

export interface DailyPoint {
  day: string
  count: number
}

export interface KpiResponse {
  repositories: { total: number; done: number; processing: number; failed: number; pending: number }
  mcpCalls: { total: number; successRate: number | null; daily: DailyPoint[] }
  chatSessions: { total: number; daily: DailyPoint[] }
  activeUsers: { total: number; daily: DailyPoint[] }
}

export interface McpTrafficPoint {
  day: string
  success: number
  failure: number
  rate_limited: number
}

export interface FailureRow {
  errorCode: string | null
  toolName: string | null
  count: number
  pct: number
}

export interface LatencyRow {
  toolName: string
  p50: number
  p95: number
  p99: number
  count: number
}

export interface IndexingHealth {
  byStatus: Array<{ status: string; count: number }>
  avgDurationSec: number | null
  recentFailures: Array<{ repositoryName: string | null; failureReason: string | null; finishedAt: string | null }>
}

export interface StaleBranchRow {
  repositoryName: string | null
  branchName: string
  lastIndexedAt: string | null
}

export interface StuckRepoRow {
  name: string
  status: string
}

export interface TokenHealth {
  active: number
  revoked: number
  expired: number
  nearingExpiry: number
}

export interface HealthResponse {
  mcpTraffic: McpTrafficPoint[]
  failures: FailureRow[]
  latency: LatencyRow[]
  indexing: IndexingHealth
  staleBranches: StaleBranchRow[]
  stuckRepos: StuckRepoRow[]
  tokens: TokenHealth
}

export interface LabeledCount {
  label: string
  count: number
}

export interface TopRepoRow {
  repositoryName: string | null
  calls: number
  distinctClients: number
  lastUsed: string | null
}

export interface CorpusFootprint {
  repositories: number
  branches: number
  documents: number
  chunks: number
  wikiPages: { done: number; generating: number; pending: number; failed: number }
}

export interface UtilizationResponse {
  topTools: LabeledCount[]
  topClients: LabeledCount[]
  principalSplit: { static: number; oauth: number }
  topRepositories: TopRepoRow[]
  onboarding: DailyPoint[]
  mcpVsChat: Array<{ day: string; mcp: number; chat: number }>
  corpus: CorpusFootprint
}
