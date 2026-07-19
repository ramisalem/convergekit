import { getApiBaseUrl } from '@/lib/runtime-urls'
import type {
  AnalyticsWindow,
  CreateRepositoryInput,
  HealthResponse,
  KpiResponse,
  RepositoryGuideSummary,
  RepositoryResponse,
  UtilizationResponse,
} from '@convergekit/types'

const API_URL = getApiBaseUrl()

// ─── Error ───────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  })

  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      if (typeof body?.error === 'string') message = body.error
    } catch {
      // ignore parse errors — use statusText
    }
    throw new ApiError(res.status, message)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ─── Current user / auth config ──────────────────────────────────────────────

export type SupportContact = {
  name: string
  email: string
}

export type CurrentUserResponse = {
  user: {
    id: string
    name: string
    email: string
    image?: string | null
    role: 'admin' | 'user'
    groupId: string | null
    ciTokensEnabled: boolean
  }
  supportContacts: SupportContact[]
}

export const meApi = {
  get(): Promise<CurrentUserResponse> {
    return apiFetch('/api/me')
  },
}

// ─── Connected agents (OAuth) ─────────────────────────────────────────────────

export type ConnectedAgent = {
  clientId: string
  clientName: string
  createdAt: string
  lastUsedAt: string | null
}

export const connectedAgentsApi = {
  list(): Promise<{ agents: ConnectedAgent[] }> {
    return apiFetch('/api/me/connected-agents')
  },
  revoke(clientId: string): Promise<{ revoked: number }> {
    return apiFetch(`/api/me/connected-agents/${encodeURIComponent(clientId)}`, {
      method: 'DELETE',
    })
  },
}

// ─── MCP OAuth consent ────────────────────────────────────────────────────────

export type McpConsentDisplay = {
  clientName: string
  scopes: string[]
  repositoryCount: number
  user: { name: string; email: string }
}

export const mcpOAuthApi = {
  getConsent(request: string): Promise<McpConsentDisplay> {
    return apiFetch(`/api/mcp-oauth/consent?request=${encodeURIComponent(request)}`)
  },
  decideConsent(request: string, decision: 'approve' | 'deny'): Promise<{ redirectUri: string }> {
    return apiFetch('/api/mcp-oauth/consent', {
      method: 'POST',
      body: JSON.stringify({ request, decision }),
    })
  },
}

export const authConfigApi = {
  getConfig(): Promise<{ workforceSsoEnabled: boolean; workforceSsoProviderLabel: string }> {
    return apiFetch('/api/auth/config')
  },
}

// ─── GitHub ───────────────────────────────────────────────────────────────────

export type GitHubRepo = {
  name: string
  fullName: string
  cloneUrl: string
  isPrivate: boolean
  defaultBranch: string
  description: string | null
}

export const githubApi = {
  listRepos(): Promise<{
    repos: GitHubRepo[]
    requiresReconnect?: boolean
    warning?: string | null
  }> {
    return apiFetch('/api/repositories/github-repos')
  },
}

// ─── Repositories ─────────────────────────────────────────────────────────────

export type { IncrementalIndexingSummary } from '@/components/repository-detail/incremental-freshness'

export type IndexingRunResponse = {
  id: string
  kind: 'full' | 'incremental'
  trigger: 'scheduled' | 'manual' | 'full_reindex'
  status: string
  fromCommit: string | null
  toCommit: string | null
  changedFileCount: number
  deletedFileCount: number
  skippedFileCount: number
  chunkCount: number
  failureReason: string | null
  failureCode: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  durationMs: number | null
}

export const repositoriesApi = {
  list(): Promise<{ repositories: RepositoryResponse[] }> {
    return apiFetch('/api/repositories')
  },

  get(id: string): Promise<{ repository: RepositoryResponse }> {
    return apiFetch(`/api/repositories/${id}`)
  },

  getGuide(id: string): Promise<{ guide: RepositoryGuideSummary }> {
    return apiFetch(`/api/repositories/${id}/guide`)
  },

  create(input: CreateRepositoryInput): Promise<{ repositoryId: string; jobId: string }> {
    return apiFetch('/api/repositories', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  delete(id: string): Promise<void> {
    return apiFetch(`/api/repositories/${id}`, { method: 'DELETE' })
  },

  reindex(id: string): Promise<{ jobId: string }> {
    return apiFetch(`/api/repositories/${id}/reindex`, { method: 'POST' })
  },

  regenerateWiki(id: string): Promise<{ jobId: string; queue?: string }> {
    return apiFetch(`/api/repositories/${id}/regenerate-wiki`, { method: 'POST' })
  },

  checkIncrementalNow(id: string): Promise<{ outcome: string; incrementalIndexing: unknown }> {
    return apiFetch(`/api/repositories/${id}/incremental-indexing/check-now`, { method: 'POST' })
  },

  pauseIncremental(id: string): Promise<{ incrementalIndexing: unknown }> {
    return apiFetch(`/api/repositories/${id}/incremental-indexing/pause`, { method: 'POST' })
  },

  resumeIncremental(id: string): Promise<{ incrementalIndexing: unknown }> {
    return apiFetch(`/api/repositories/${id}/incremental-indexing/resume`, { method: 'POST' })
  },

  listIncrementalRuns(id: string, limit = 10): Promise<{ runs: IndexingRunResponse[] }> {
    return apiFetch(`/api/repositories/${id}/incremental-indexing/runs?limit=${limit}`)
  },
}

// ─── CI / automation tokens — self-service (/api/me/ci-tokens) ───────────────
// Every route scopes to the caller's own tokens: create, renew, and connection
// testing are self-service only (gated server-side on the caller's
// ciTokensEnabled capability flag) and therefore live here, not on the admin client.

export type McpServerConfig = {
  mcpServers: Record<
    string,
    | {
        url: string
        headers: {
          Authorization: string
        }
      }
    | {
        command: string
        args: string[]
        env: Record<string, string>
      }
  >
}

export type McpClientConfigKey = 'claudeDesktop' | 'cursor' | 'generic'

export type McpClientConfig = {
  label: string
  description: string
  config: McpServerConfig
}

export type McpTokenConfig = {
  tokenId: string
  label: string
  mcpServerName: string
  mcpEndpoint: string
  note: string
  config: McpServerConfig
  clientConfigs: Record<McpClientConfigKey, McpClientConfig>
}

export type McpConnectionTestResult = {
  ok: boolean
  endpoint: string
  latencyMs: number
  checks: {
    endpoint: { status: 'passed' | 'failed' | 'skipped'; message: string }
    auth: { status: 'passed' | 'failed' | 'skipped'; message: string }
    tools: { status: 'passed' | 'failed' | 'skipped'; message: string }
  }
  tools: {
    expected: string[]
    found: string[]
    missing: string[]
  }
  error?: string
}

export type McpScope = 'repo:read' | 'docs:search' | 'files:read'
export type McpTokenStatus = 'active' | 'expired' | 'revoked'

export type McpTokenOwnerOption = {
  id: string
  name: string
  email: string
}

export type McpTokenListItem = {
  id: string
  label: string
  fingerprint: string
  owner: McpTokenOwnerOption
  scopes: McpScope[]
  status: McpTokenStatus
  expiresAt: string
  revokedAt: string | null
  revokedReason: string | null
  lastUsedAt: string | null
  lastUsedFrom: {
    ip: string | null
    userAgent: string | null
    clientName: string | null
    toolName: string | null
  }
  createdAt: string
  alertCount: number
}

// Legacy (grandfathered) repo-scoped tokens: same base fields as McpTokenListItem
// plus the repository they're pinned to. `owner` is only present on admin oversight
// rows (the self-service /api/me list never joins it in — every row is the caller's
// own); `repository.deletedAt` is only present on admin rows too, so oversight can
// flag active tokens on soft-deleted repos.
export type LegacyCiTokenListItem = Omit<McpTokenListItem, 'owner'> & {
  owner?: McpTokenOwnerOption
  repository: {
    id: string
    name: string
    deletedAt?: string | null
  }
}

export type McpTokenAuditEvent = {
  id: string
  tokenId: string | null
  repositoryId: string | null
  userId: string | null
  tokenLabel: string
  tokenFingerprint: string
  clientLabel: string | null
  clientName: string | null
  ipAddress: string | null
  userAgent: string | null
  method: string
  toolName: string | null
  latencyMs: number
  status: 'success' | 'failure' | 'rate_limited'
  statusCode: number | null
  errorCode: string | null
  createdAt: string
}

export type McpTokenAlert = {
  id: string
  tokenId: string
  repositoryId: string | null
  userId: string
  kind: string
  message: string
  details: string | null
  status: 'open' | 'acknowledged'
  firstSeenAt: string
  lastSeenAt: string
  acknowledgedAt: string | null
}

export const meCiTokensApi = {
  list(): Promise<{ tokens: McpTokenListItem[] }> {
    return apiFetch('/api/me/ci-tokens')
  },

  create(input: {
    label: string
    expiresInDays: 7 | 30 | 90
    scopes: McpScope[]
  }): Promise<McpTokenConfig & { token: string; tokenDetails: McpTokenListItem }> {
    return apiFetch('/api/me/ci-tokens', { method: 'POST', body: JSON.stringify(input) })
  },

  renew(
    tokenId: string,
  ): Promise<McpTokenConfig & { token: string; tokenDetails: McpTokenListItem }> {
    return apiFetch(`/api/me/ci-tokens/${tokenId}/renew`, { method: 'POST' })
  },

  revoke(tokenId: string): Promise<void> {
    return apiFetch(`/api/me/ci-tokens/${tokenId}`, { method: 'DELETE' })
  },

  getConfig(tokenId: string): Promise<McpTokenConfig> {
    return apiFetch(`/api/me/ci-tokens/${tokenId}/config`)
  },

  listAudit(tokenId: string): Promise<{ events: McpTokenAuditEvent[] }> {
    return apiFetch(`/api/me/ci-tokens/${tokenId}/audit`)
  },

  listAlerts(tokenId: string): Promise<{ alerts: McpTokenAlert[] }> {
    return apiFetch(`/api/me/ci-tokens/${tokenId}/alerts`)
  },

  acknowledgeAlert(tokenId: string, alertId: string): Promise<{ alert: McpTokenAlert }> {
    return apiFetch(`/api/me/ci-tokens/${tokenId}/alerts/${alertId}/acknowledge`, {
      method: 'POST',
    })
  },

  testConnection(tokenId: string, token?: string): Promise<McpConnectionTestResult> {
    return apiFetch(`/api/me/ci-tokens/${tokenId}/test`, {
      method: 'POST',
      body: JSON.stringify(token ? { token } : {}),
    })
  },

  listLegacy(): Promise<{ tokens: LegacyCiTokenListItem[] }> {
    return apiFetch('/api/me/ci-tokens/legacy')
  },

  revokeLegacy(tokenId: string): Promise<void> {
    return apiFetch(`/api/me/ci-tokens/legacy/${tokenId}`, { method: 'DELETE' })
  },
}

// ─── CI / automation tokens — admin oversight (/api/admin/ci-tokens) ─────────
// Oversight-only: list/inspect/revoke across every user's tokens (both shapes),
// but no create/renew/test — minting and rotation are self-service, even for an
// admin acting on their own token (see meCiTokensApi above).

// The admin oversight legacy list always joins owner + repository.deletedAt (see
// ci-tokens.ts's GET /legacy) — narrower than the self-service LegacyCiTokenListItem,
// which leaves both optional. Typing them as required here saves optional-chaining
// on every admin row, since the oversight dashboard renders both unconditionally.
export type AdminLegacyCiTokenListItem = LegacyCiTokenListItem & {
  owner: McpTokenOwnerOption
  repository: LegacyCiTokenListItem['repository'] & { deletedAt: string | null }
}

export const adminCiTokensApi = {
  list(): Promise<{ tokens: McpTokenListItem[] }> {
    return apiFetch('/api/admin/ci-tokens')
  },

  revoke(tokenId: string): Promise<void> {
    return apiFetch(`/api/admin/ci-tokens/${tokenId}`, { method: 'DELETE' })
  },

  getConfig(tokenId: string): Promise<McpTokenConfig> {
    return apiFetch(`/api/admin/ci-tokens/${tokenId}/config`)
  },

  listAudit(tokenId: string): Promise<{ events: McpTokenAuditEvent[] }> {
    return apiFetch(`/api/admin/ci-tokens/${tokenId}/audit`)
  },

  listAlerts(tokenId: string): Promise<{ alerts: McpTokenAlert[] }> {
    return apiFetch(`/api/admin/ci-tokens/${tokenId}/alerts`)
  },

  acknowledgeAlert(tokenId: string, alertId: string): Promise<{ alert: McpTokenAlert }> {
    return apiFetch(`/api/admin/ci-tokens/${tokenId}/alerts/${alertId}/acknowledge`, {
      method: 'POST',
    })
  },

  listLegacy(): Promise<{ tokens: AdminLegacyCiTokenListItem[] }> {
    return apiFetch('/api/admin/ci-tokens/legacy')
  },

  revokeLegacy(tokenId: string): Promise<void> {
    return apiFetch(`/api/admin/ci-tokens/legacy/${tokenId}`, { method: 'DELETE' })
  },
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export type ChatSession = {
  id: string
  repositoryId: string
  title: string | null
  createdAt: string
  updatedAt: string
  messageCount?: number
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export const chatApi = {
  listSessions(repositoryId: string): Promise<{ sessions: ChatSession[] }> {
    return apiFetch(`/api/chat?repositoryId=${encodeURIComponent(repositoryId)}`)
  },

  createSession(repositoryId: string): Promise<{ session: ChatSession }> {
    return apiFetch('/api/chat/sessions', {
      method: 'POST',
      body: JSON.stringify({ repositoryId }),
    })
  },

  getSession(
    repositoryId: string,
    sessionId: string,
  ): Promise<{ session: ChatSession; messages: ChatMessage[] }> {
    return apiFetch(
      `/api/chat/sessions/${encodeURIComponent(sessionId)}?repositoryId=${encodeURIComponent(repositoryId)}`,
    )
  },

  deleteSession(repositoryId: string, sessionId: string): Promise<{ ok: true }> {
    return apiFetch(
      `/api/chat/sessions/${encodeURIComponent(sessionId)}?repositoryId=${encodeURIComponent(repositoryId)}`,
      { method: 'DELETE' },
    )
  },

  sendMessage(sessionId: string, repositoryId: string, message: string): Promise<Response> {
    return fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, repositoryId, message }),
    })
  },
}

// ─── Documents ────────────────────────────────────────────────────────────────

export type DocumentPath = { path: string; programmingLanguage: string | null }
export type DocumentContent = {
  id: string
  path: string
  content: string
  programmingLanguage: string | null
}

export const documentsApi = {
  list(repositoryId: string): Promise<{ documents: DocumentPath[] }> {
    return apiFetch(`/api/documents?repositoryId=${encodeURIComponent(repositoryId)}`)
  },

  getContent(repositoryId: string, path: string): Promise<{ document: DocumentContent }> {
    return apiFetch(
      `/api/documents/content?repositoryId=${encodeURIComponent(repositoryId)}&path=${encodeURIComponent(path)}`,
    )
  },
}

// ─── Wiki ─────────────────────────────────────────────────────────────────────

export type WikiPageSummary = {
  slug: string
  title: string
  orderIndex: number
  summary: string | null
  status: string
  generatedAt: string | null
}

export type WikiSection = WikiPageSummary & { pages: WikiPageSummary[] }

export type EvidenceSourceMetadata = {
  path: string
  evidenceTier: 'A' | 'B' | 'C' | 'D' | null
  evidenceKind: string | null
  evidenceAlignmentStatus: 'unverified' | 'aligned' | 'stale' | 'conflicts' | null
}

export type WikiPageContent = {
  slug: string
  title: string
  parentSlug: string | null
  content: string
  summary: string | null
  status: string
  generatedAt: string | null
  commitSha: string | null
  orderIndex: number
  sourceFiles: string[] | null
  sourceFileMetadata: EvidenceSourceMetadata[]
}

export const wikiApi = {
  getPages(repositoryId: string): Promise<{
    repositoryId: string
    lastGeneratedAt: string | null
    commitSha: string | null
    sections: WikiSection[]
  }> {
    return apiFetch(`/api/wiki/${encodeURIComponent(repositoryId)}/pages`)
  },

  getPage(
    repositoryId: string,
    slug: string,
  ): Promise<{ page: WikiPageContent } | { status: string }> {
    return apiFetch(
      `/api/wiki/${encodeURIComponent(repositoryId)}/pages/${encodeURIComponent(slug)}`,
    )
  },
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export type AIProvider = 'anthropic' | 'openai' | 'openrouter' | 'lmstudio'

export type CategorizedModels = { embedding: string[]; chat: string[]; error?: string }

export type AiSettings = {
  provider: AIProvider
  hasApiKey: boolean
  maskedApiKey: string | null
  lmStudioChatModel: string | null
  lmStudioMindmapModel: string | null
  lmStudioEmbeddingModel: string | null
  openrouterChatModel: string | null
  openrouterMindmapModel: string | null
  openrouterEmbeddingModel: string | null
  openrouterEndpoint: string | null
  anthropicChatModel: string | null
  anthropicMindmapModel: string | null
  anthropicEmbeddingModel: string | null
  openaiChatModel: string | null
  openaiMindmapModel: string | null
  openaiEmbeddingModel: string | null
  openaiEndpoint: string | null
}

export type AiSettingsDraft = Omit<AiSettings, 'hasApiKey' | 'maskedApiKey'> & {
  apiKey?: string
}

export type AccessPolicySettings = {
  allowedEmailDomain: string | null
  allowedGitHubOrg: string | null
  allowedRepositoryHost: string
  editable: false
}

export type ConnectionTestResult = {
  ok: boolean
  latencyMs: number
  error?: string
  dimensions?: number
}

export const settingsApi = {
  getAi(): Promise<AiSettings> {
    return apiFetch('/api/settings/ai')
  },

  getAccessPolicy(): Promise<AccessPolicySettings> {
    return apiFetch('/api/settings/access-policy')
  },

  updateAi(payload: {
    provider: AIProvider
    apiKey?: string
    clearApiKey?: boolean
    [key: string]: unknown
  }): Promise<AiSettings> {
    return apiFetch('/api/settings/ai', {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },

  getLmStudioModels(): Promise<CategorizedModels> {
    return apiFetch('/api/settings/lmstudio-models')
  },

  getOpenRouterModels(): Promise<CategorizedModels> {
    return apiFetch('/api/settings/openrouter-models')
  },

  getAnthropicModels(): Promise<CategorizedModels> {
    return apiFetch('/api/settings/anthropic-models')
  },

  getOpenAiModels(): Promise<CategorizedModels> {
    return apiFetch('/api/settings/openai-models')
  },

  testConnections(payload?: AiSettingsDraft): Promise<{
    results: Record<string, ConnectionTestResult>
  }> {
    return apiFetch('/api/settings/test', {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    })
  },
}

// ─── Groups (admin only) ─────────────────────────────────────────────────────

export type Group = {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export const groupsApi = {
  list(): Promise<{ groups: Group[] }> {
    return apiFetch('/api/groups')
  },

  get(id: string): Promise<{
    group: Group
    members: Array<{ id: string; name: string; email: string; image: string | null }>
    repositories: Array<{ repositoryId: string; name: string; assignedAt: string }>
  }> {
    return apiFetch(`/api/groups/${id}`)
  },

  create(input: { name: string; description?: string }): Promise<{ group: Group }> {
    return apiFetch('/api/groups', { method: 'POST', body: JSON.stringify(input) })
  },

  update(id: string, input: { name?: string; description?: string }): Promise<{ group: Group }> {
    return apiFetch(`/api/groups/${id}`, { method: 'PUT', body: JSON.stringify(input) })
  },

  delete(id: string): Promise<void> {
    return apiFetch(`/api/groups/${id}`, { method: 'DELETE' })
  },

  assignRepos(id: string, repositoryIds: string[]): Promise<{ assigned: string[] }> {
    return apiFetch(`/api/groups/${id}/repositories`, {
      method: 'POST',
      body: JSON.stringify({ repositoryIds }),
    })
  },

  unassignRepo(id: string, repoId: string): Promise<void> {
    return apiFetch(`/api/groups/${id}/repositories/${repoId}`, { method: 'DELETE' })
  },
}

// ─── User Management (admin only) ───────────────────────────────────────────

export type ManagedUser = {
  id: string
  name: string
  email: string
  image: string | null
  role: 'admin' | 'user'
  groupId: string | null
  createdAt: string
  deactivatedAt: string | null
  ciTokensEnabled: boolean
  pendingInvite: boolean
}

export const usersApi = {
  list(): Promise<{ users: ManagedUser[] }> {
    return apiFetch('/api/users')
  },

  get(id: string): Promise<{ user: ManagedUser }> {
    return apiFetch(`/api/users/${id}`)
  },

  invite(input: {
    name: string
    email: string
    role?: 'admin' | 'user'
    groupId?: string
  }): Promise<{ user: ManagedUser; inviteUrl: string }> {
    return apiFetch('/api/users', { method: 'POST', body: JSON.stringify(input) })
  },

  update(
    id: string,
    input: {
      name?: string
      groupId?: string | null
      role?: 'admin' | 'user'
      ciTokensEnabled?: boolean
    },
  ): Promise<{ user: ManagedUser }> {
    return apiFetch(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(input) })
  },

  bulkUpdate(input: {
    userIds: string[]
    groupId?: string | null
    role?: 'admin' | 'user'
    deactivated?: boolean
  }): Promise<{ updated: string[] }> {
    return apiFetch('/api/users/bulk', { method: 'PATCH', body: JSON.stringify(input) })
  },

  revokeAllMcpTokens(id: string): Promise<{ revoked: number }> {
    return apiFetch(`/api/users/${id}/mcp-tokens/revoke-all`, { method: 'POST' })
  },

  deactivate(id: string): Promise<{ user: ManagedUser; revoked: number }> {
    return apiFetch(`/api/users/${id}/deactivate`, { method: 'POST' })
  },

  reactivate(id: string): Promise<{ user: ManagedUser }> {
    return apiFetch(`/api/users/${id}/reactivate`, { method: 'POST' })
  },

  resendInvite(id: string): Promise<{ inviteUrl: string }> {
    return apiFetch(`/api/users/${id}/resend-invite`, { method: 'POST' })
  },

  resetPassword(id: string): Promise<{ resetUrl: string }> {
    return apiFetch(`/api/users/${id}/reset-password`, { method: 'POST' })
  },

  delete(id: string): Promise<void> {
    return apiFetch(`/api/users/${id}`, { method: 'DELETE' })
  },
}

// ─── Public invite endpoints (no auth) ──────────────────────────────────────

export const invitesApi = {
  verify(token: string): Promise<{ email: string; hasPassword: boolean }> {
    return apiFetch(`/api/invites/verify?token=${encodeURIComponent(token)}`)
  },

  setPassword(input: { token: string; password: string }): Promise<{ success: true }> {
    return apiFetch('/api/invites/set-password', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
}

// ─── useQuery-compatible helpers ──────────────────────────────────────────────
// These async functions can be called directly in Server Components or wrapped
// with React Query / SWR in Client Components.

export async function fetchRepositories() {
  return repositoriesApi.list()
}

export async function fetchRepository(id: string) {
  return repositoriesApi.get(id)
}

export function fetchRepositoryDetailRecord(id: string) {
  return repositoriesApi.get(id).then(({ repository }) => repository)
}

// ─── Admin analytics ───────────────────────────────────────────────────────
export const analyticsApi = {
  kpis(window: AnalyticsWindow): Promise<KpiResponse> {
    return apiFetch(`/api/admin/analytics/kpis?window=${window}`)
  },
  health(window: AnalyticsWindow): Promise<HealthResponse> {
    return apiFetch(`/api/admin/analytics/health?window=${window}`)
  },
  utilization(window: AnalyticsWindow): Promise<UtilizationResponse> {
    return apiFetch(`/api/admin/analytics/utilization?window=${window}`)
  },
}
