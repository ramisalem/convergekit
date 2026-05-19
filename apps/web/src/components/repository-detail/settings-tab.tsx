'use client'

import {
  ApiError,
  repositoriesApi,
  type McpClientConfigKey,
  type McpConnectionTestResult,
  type McpScope,
  type McpTokenAlert,
  type McpTokenAuditEvent,
  type McpTokenConfig,
  type McpTokenListItem,
  type McpTokenOwnerOption,
} from '@/lib/api-client'
import { ClientTime } from '@/components/ui/client-time'
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

type Token = {
  id: string
} & McpTokenListItem

type NewTokenSetup = McpTokenConfig & { token: string; tokenDetails: McpTokenListItem }

const MCP_SCOPES: Array<{ scope: McpScope; label: string }> = [
  { scope: 'repo:read', label: 'Repository structure' },
  { scope: 'docs:search', label: 'Documentation search' },
  { scope: 'files:read', label: 'File reads' },
]

const MCP_CLIENTS: Array<{ key: McpClientConfigKey; label: string }> = [
  { key: 'claudeDesktop', label: 'Claude Desktop' },
  { key: 'cursor', label: 'Cursor' },
  { key: 'generic', label: 'JSON' },
]

function configToText(config: McpTokenConfig, activeClient: McpClientConfigKey) {
  return JSON.stringify(config.clientConfigs[activeClient].config, null, 2)
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
      title="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function TokenHealthBadge({
  token,
  result,
}: {
  token: Token
  result: McpConnectionTestResult | null
}) {
  const t = useTranslations('repositoryDetail.settings')
  const passed = token.status === 'active' && result?.ok
  const used = !!token.lastUsedAt
  const className = passed
    ? 'border-green-200 bg-green-50 text-green-700'
    : token.status === 'revoked'
      ? 'border-red-200 bg-red-50 text-red-700'
      : token.status === 'expired'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : used
          ? 'border-blue-200 bg-blue-50 text-blue-700'
          : 'border-neutral-200 bg-neutral-50 text-neutral-600'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {passed ? <CheckCircle2 className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
      {passed
        ? t('connectionPassed')
        : token.status === 'revoked'
          ? 'Revoked'
          : token.status === 'expired'
            ? 'Expired'
            : used
              ? t('connected')
              : t('notUsedYet')}
    </span>
  )
}

function ConnectionCheck({
  label,
  status,
  message,
}: {
  label: string
  status: 'passed' | 'failed' | 'skipped'
  message: string
}) {
  const color =
    status === 'passed'
      ? 'text-green-700'
      : status === 'failed'
        ? 'text-red-700'
        : 'text-neutral-500'
  const Icon = status === 'passed' ? CheckCircle2 : status === 'failed' ? AlertCircle : Terminal

  return (
    <div className="flex items-start gap-2">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
      <div>
        <p className="text-xs font-medium text-neutral-800">{label}</p>
        <p className="text-xs text-neutral-500">{message}</p>
      </div>
    </div>
  )
}

function ConnectionResultPanel({ result }: { result: McpConnectionTestResult }) {
  const t = useTranslations('repositoryDetail.settings')

  return (
    <div
      className={`mt-3 rounded-md border px-3 py-3 ${
        result.ok ? 'border-green-200 bg-green-50/70' : 'border-red-200 bg-red-50/70'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-sm font-medium ${result.ok ? 'text-green-800' : 'text-red-800'}`}>
          {result.ok ? t('connectionPassed') : t('connectionFailed')}
        </p>
        <span className="text-xs text-neutral-500">{result.latencyMs} ms</span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <ConnectionCheck
          label={t('endpoint')}
          status={result.checks.endpoint.status}
          message={result.checks.endpoint.message}
        />
        <ConnectionCheck
          label={t('authentication')}
          status={result.checks.auth.status}
          message={result.checks.auth.message}
        />
        <ConnectionCheck
          label={t('tools')}
          status={result.checks.tools.status}
          message={result.checks.tools.message}
        />
      </div>
      {result.error && <p className="mt-3 text-xs text-red-700">{result.error}</p>}
    </div>
  )
}

interface McpSetupPanelProps {
  config: McpTokenConfig
  activeClient: McpClientConfigKey
  onActiveClientChange: (client: McpClientConfigKey) => void
  onCopyConfig: () => void
  rawToken?: string
}

function McpSetupPanel({
  config,
  activeClient,
  onActiveClientChange,
  onCopyConfig,
  rawToken,
}: McpSetupPanelProps) {
  const t = useTranslations('repositoryDetail.settings')
  const clientConfig = config.clientConfigs[activeClient]

  return (
    <div className="rounded-lg border border-border bg-neutral-50/60 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-900">{t('clientSetup')}</p>
          <p className="mt-0.5 text-xs text-neutral-500">{clientConfig.description}</p>
        </div>
        <button
          type="button"
          onClick={onCopyConfig}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          {t('copySelectedConfig')}
        </button>
      </div>

      <div className="mt-3 inline-flex rounded-md border border-border bg-white p-0.5">
        {MCP_CLIENTS.map((client) => (
          <button
            key={client.key}
            type="button"
            onClick={() => onActiveClientChange(client.key)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              activeClient === client.key
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            {client.label}
          </button>
        ))}
      </div>

      {rawToken && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-green-200 bg-white px-3 py-2">
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-700">
            {rawToken}
          </code>
          <CopyButton text={rawToken} />
        </div>
      )}

      <pre className="mt-3 max-h-72 overflow-auto rounded-md border border-border bg-white p-3 text-xs text-neutral-800">
        <code>{configToText(config, activeClient)}</code>
      </pre>
    </div>
  )
}

interface NewTokenBannerProps {
  setup: NewTokenSetup
  activeClient: McpClientConfigKey
  onActiveClientChange: (client: McpClientConfigKey) => void
  onCopyConfig: () => void
  testResult: McpConnectionTestResult | null
  testing: boolean
  onTest: () => void
  onDismiss: () => void
}
function NewTokenBanner({
  setup,
  activeClient,
  onActiveClientChange,
  onCopyConfig,
  testResult,
  testing,
  onTest,
  onDismiss,
}: NewTokenBannerProps) {
  const t = useTranslations('repositoryDetail.settings')
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-green-800">{t('tokenCreated')}</p>
          <p className="mt-1 text-xs text-green-700">{t('tokenOnce')}</p>
        </div>
        <button
          type="button"
          onClick={onTest}
          disabled={testing}
          className="inline-flex items-center gap-1.5 rounded-md border border-green-200 bg-white px-2.5 py-1.5 text-xs font-medium text-green-800 transition-colors hover:bg-green-100 disabled:opacity-60"
        >
          {testing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Terminal className="h-3.5 w-3.5" />
          )}
          {testing ? t('testingConnection') : t('testConnection')}
        </button>
      </div>
      <div className="mt-3">
        <McpSetupPanel
          config={setup}
          activeClient={activeClient}
          onActiveClientChange={onActiveClientChange}
          onCopyConfig={onCopyConfig}
          rawToken={setup.token}
        />
      </div>
      {testResult && <ConnectionResultPanel result={testResult} />}
      <button
        onClick={onDismiss}
        className="mt-2 text-xs text-green-700 underline underline-offset-2 hover:text-green-900"
      >
        {t('dismiss')}
      </button>
    </div>
  )
}

interface Props {
  repositoryId: string
  repositoryName: string
  isAdmin: boolean
  currentUserId: string | null
}

export function SettingsTab({ repositoryId, repositoryName, isAdmin, currentUserId }: Props) {
  const t = useTranslations('repositoryDetail.settings')
  const router = useRouter()
  const params = useParams<{ locale: string }>()

  const [tokens, setTokens] = useState<Token[]>([])
  const [ownerOptions, setOwnerOptions] = useState<McpTokenOwnerOption[]>([])
  const [ownerFilterUserId, setOwnerFilterUserId] = useState('all')
  const [newLabel, setNewLabel] = useState('')
  const [expiresInDays, setExpiresInDays] = useState<7 | 30 | 90>(30)
  const [selectedScopes, setSelectedScopes] = useState<McpScope[]>(
    MCP_SCOPES.map((entry) => entry.scope),
  )
  const [creating, setCreating] = useState(false)
  const [newTokenSetup, setNewTokenSetup] = useState<NewTokenSetup | null>(null)
  const [setupByTokenId, setSetupByTokenId] = useState<Record<string, McpTokenConfig>>({})
  const [auditByTokenId, setAuditByTokenId] = useState<Record<string, McpTokenAuditEvent[]>>({})
  const [alertsByTokenId, setAlertsByTokenId] = useState<Record<string, McpTokenAlert[]>>({})
  const [expandedSetupId, setExpandedSetupId] = useState<string | null>(null)
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null)
  const [expandedAlertsId, setExpandedAlertsId] = useState<string | null>(null)
  const [activeClientByTokenId, setActiveClientByTokenId] = useState<
    Record<string, McpClientConfigKey>
  >({})
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, McpConnectionTestResult>>({})
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Reindex state
  const [reindexing, setReindexing] = useState(false)
  const [reindexError, setReindexError] = useState<string | null>(null)

  // Regenerate wiki state
  const [regeneratingWiki, setRegeneratingWiki] = useState(false)
  const [regenerateWikiError, setRegenerateWikiError] = useState<string | null>(null)

  // Delete repository state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const loadTokens = useCallback(async () => {
    try {
      const { tokens, ownerOptions } = await repositoriesApi.listMcpTokens(repositoryId, {
        ownerUserId: isAdmin && ownerFilterUserId !== 'all' ? ownerFilterUserId : null,
      })
      setTokens(tokens)
      setOwnerOptions(ownerOptions)
    } catch {
      // non-fatal
    }
  }, [isAdmin, ownerFilterUserId, repositoryId])

  useEffect(() => {
    void loadTokens()
  }, [loadTokens])

  function activeClientFor(tokenId: string) {
    return activeClientByTokenId[tokenId] ?? 'claudeDesktop'
  }

  function setActiveClientFor(tokenId: string, client: McpClientConfigKey) {
    setActiveClientByTokenId((prev) => ({ ...prev, [tokenId]: client }))
  }

  async function copySetupConfig(config: McpTokenConfig, activeClient: McpClientConfigKey) {
    await navigator.clipboard.writeText(configToText(config, activeClient))
  }

  async function createToken(e: React.FormEvent) {
    e.preventDefault()
    if (!newLabel.trim() || selectedScopes.length === 0) return
    setCreating(true)
    setError(null)
    try {
      const setup = await repositoriesApi.createMcpToken(repositoryId, {
        label: newLabel.trim(),
        expiresInDays,
        scopes: selectedScopes,
      })
      setNewTokenSetup(setup)
      setSetupByTokenId((prev) => ({ ...prev, [setup.tokenId]: setup }))
      setActiveClientFor(setup.tokenId, 'claudeDesktop')
      setNewLabel('')
      await loadTokens()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create token')
    } finally {
      setCreating(false)
    }
  }

  async function deleteToken(tokenId: string) {
    setDeletingId(tokenId)
    try {
      await repositoriesApi.deleteMcpToken(repositoryId, tokenId)
      await loadTokens()
      setSetupByTokenId((prev) => {
        const next = { ...prev }
        delete next[tokenId]
        return next
      })
      setTestResults((prev) => {
        const next = { ...prev }
        delete next[tokenId]
        return next
      })
      if (expandedSetupId === tokenId) setExpandedSetupId(null)
      if (newTokenSetup?.tokenId === tokenId) setNewTokenSetup(null)
    } catch {
      // non-fatal
    } finally {
      setDeletingId(null)
    }
  }

  async function renewToken(tokenId: string) {
    setCreating(true)
    setError(null)
    try {
      const setup = await repositoriesApi.renewMcpToken(repositoryId, tokenId)
      setNewTokenSetup(setup)
      setSetupByTokenId((prev) => ({ ...prev, [setup.tokenId]: setup }))
      setActiveClientFor(setup.tokenId, 'claudeDesktop')
      await loadTokens()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to renew token')
    } finally {
      setCreating(false)
    }
  }

  function toggleScope(scope: McpScope) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((value) => value !== scope) : [...prev, scope],
    )
  }

  async function toggleSetup(tokenId: string) {
    if (expandedSetupId === tokenId) {
      setExpandedSetupId(null)
      return
    }

    setExpandedSetupId(tokenId)
    if (setupByTokenId[tokenId]) return

    try {
      const data = await repositoriesApi.getMcpConfig(repositoryId, tokenId)
      setSetupByTokenId((prev) => ({ ...prev, [tokenId]: data }))
    } catch {
      // non-fatal
    }
  }

  async function toggleAudit(tokenId: string) {
    if (expandedAuditId === tokenId) {
      setExpandedAuditId(null)
      return
    }
    setExpandedAuditId(tokenId)
    if (auditByTokenId[tokenId]) return
    const { events } = await repositoriesApi.listMcpTokenAudit(repositoryId, tokenId)
    setAuditByTokenId((prev) => ({ ...prev, [tokenId]: events }))
  }

  async function toggleAlerts(tokenId: string) {
    if (expandedAlertsId === tokenId) {
      setExpandedAlertsId(null)
      return
    }
    setExpandedAlertsId(tokenId)
    const { alerts } = await repositoriesApi.listMcpTokenAlerts(repositoryId, tokenId)
    setAlertsByTokenId((prev) => ({ ...prev, [tokenId]: alerts }))
  }

  async function acknowledgeAlert(tokenId: string, alertId: string) {
    await repositoriesApi.acknowledgeMcpTokenAlert(repositoryId, tokenId, alertId)
    const { alerts } = await repositoriesApi.listMcpTokenAlerts(repositoryId, tokenId)
    setAlertsByTokenId((prev) => ({ ...prev, [tokenId]: alerts }))
    await loadTokens()
  }

  async function testConnection(tokenId: string) {
    setTestingId(tokenId)
    try {
      const result = await repositoriesApi.testMcpConnection(
        repositoryId,
        tokenId,
        newTokenSetup?.tokenId === tokenId ? newTokenSetup.token : undefined,
      )
      setTestResults((prev) => ({ ...prev, [tokenId]: result }))
      await loadTokens()
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [tokenId]: {
          ok: false,
          endpoint: '',
          latencyMs: 0,
          checks: {
            endpoint: { status: 'failed', message: 'Connection test failed.' },
            auth: { status: 'skipped', message: 'Authentication was not checked.' },
            tools: { status: 'skipped', message: 'Tools were not checked.' },
          },
          tools: { expected: [], found: [], missing: [] },
          error: err instanceof ApiError ? err.message : 'Failed to test MCP connection',
        },
      }))
    } finally {
      setTestingId(null)
    }
  }

  async function reindex() {
    setReindexing(true)
    setReindexError(null)
    try {
      const { jobId } = await repositoriesApi.reindex(repositoryId)
      // Hard navigate so all React state (activeTab, repo status, SSE hooks) resets cleanly
      window.location.href = `/${params.locale}/repositories/${repositoryId}?tab=docs&jobId=${jobId}`
    } catch (err) {
      setReindexError(err instanceof ApiError ? err.message : 'Failed to start reindex')
      setReindexing(false)
    }
  }

  async function regenerateWiki() {
    setRegeneratingWiki(true)
    setRegenerateWikiError(null)
    try {
      const { jobId, queue } = await repositoriesApi.regenerateWiki(repositoryId)
      const queueName = queue ?? 'wiki-generation'
      window.location.href = `/${params.locale}/repositories/${repositoryId}?tab=docs&jobId=${jobId}&queue=${encodeURIComponent(queueName)}`
    } catch (err) {
      setRegenerateWikiError(
        err instanceof ApiError ? err.message : 'Failed to start wiki regeneration',
      )
      setRegeneratingWiki(false)
    }
  }

  async function deleteRepository() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await repositoriesApi.delete(repositoryId)
      router.push(`/${params.locale}/repositories`)
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete repository')
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-8 py-6">
      {/* MCP Tokens section */}
      <section>
        <h3 className="text-base font-semibold">{t('mcpTokens')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('mcpTokensDescription')}</p>

        {/* New token banner */}
        {newTokenSetup && (
          <div className="mt-4">
            <NewTokenBanner
              setup={newTokenSetup}
              activeClient={activeClientFor(newTokenSetup.tokenId)}
              onActiveClientChange={(client) => setActiveClientFor(newTokenSetup.tokenId, client)}
              onCopyConfig={() =>
                void copySetupConfig(newTokenSetup, activeClientFor(newTokenSetup.tokenId))
              }
              testResult={testResults[newTokenSetup.tokenId] ?? null}
              testing={testingId === newTokenSetup.tokenId}
              onTest={() => void testConnection(newTokenSetup.tokenId)}
              onDismiss={() => setNewTokenSetup(null)}
            />
          </div>
        )}

        {/* Create token form */}
        <form onSubmit={createToken} className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              placeholder={t('tokenLabelPlaceholder')}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="min-w-64 flex-1 rounded-md border border-border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground"
            />
            <select
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value) as 7 | 30 | 90)}
              className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground"
              aria-label="Token expiry"
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
            <button
              type="submit"
              disabled={creating || !newLabel.trim() || selectedScopes.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              {creating ? t('creating') : t('createToken')}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {MCP_SCOPES.map((entry) => (
              <label
                key={entry.scope}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-white px-2.5 py-1.5 text-xs text-neutral-700"
              >
                <input
                  type="checkbox"
                  checked={selectedScopes.includes(entry.scope)}
                  onChange={() => toggleScope(entry.scope)}
                />
                <span>
                  {entry.label} <code className="text-neutral-500">{entry.scope}</code>
                </span>
              </label>
            ))}
          </div>
        </form>

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        {isAdmin && ownerOptions.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label
              htmlFor="mcp-token-owner-filter"
              className="text-xs font-medium text-muted-foreground"
            >
              Owner
            </label>
            <select
              id="mcp-token-owner-filter"
              value={ownerFilterUserId}
              onChange={(e) => setOwnerFilterUserId(e.target.value)}
              className="min-w-64 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground"
            >
              <option value="all">All token owners</option>
              {ownerOptions.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name} ({owner.email})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Token list */}
        {tokens.length > 0 && (
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-white">
            {tokens.map((token) => {
              const isOwnToken = token.owner.id === currentUserId
              const ownerOnlyActionTitle = isOwnToken
                ? undefined
                : 'Only the token owner can use this action'

              return (
                <li key={token.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{token.label}</p>
                        <TokenHealthBadge token={token} result={testResults[token.id] ?? null} />
                      </div>
                      {isAdmin && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Created by {token.owner.name}{' '}
                          <span className="text-neutral-500">{token.owner.email}</span>
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        Fingerprint: <code>{token.fingerprint}</code> · Expires{' '}
                        <ClientTime iso={token.expiresAt} style="dateTime" />
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Scopes: {token.scopes.join(', ')}
                      </p>
                      {token.revokedReason && (
                        <p className="mt-0.5 text-xs text-red-600">
                          Revocation reason: {token.revokedReason}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t('lastUsed')}:{' '}
                        <ClientTime iso={token.lastUsedAt} style="dateTime" fallback={t('never')} />
                      </p>
                      {(token.lastUsedFrom.ip ||
                        token.lastUsedFrom.clientName ||
                        token.lastUsedFrom.toolName) && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Last used from: {token.lastUsedFrom.clientName ?? 'unknown client'}
                          {token.lastUsedFrom.toolName ? ` / ${token.lastUsedFrom.toolName}` : ''}
                          {token.lastUsedFrom.ip ? ` / ${token.lastUsedFrom.ip}` : ''}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t('created')} <ClientTime iso={token.createdAt} style="dateTime" />
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void toggleSetup(token.id)}
                        disabled={!isOwnToken}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                        title={ownerOnlyActionTitle ?? t('clientSetup')}
                      >
                        <ExternalLink className="h-3 w-3" />
                        {expandedSetupId === token.id ? t('hideSetup') : t('setup')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void renewToken(token.id)}
                        disabled={creating || !isOwnToken}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                        title={ownerOnlyActionTitle ?? 'Renew token'}
                      >
                        <RefreshCw className="h-3 w-3" />
                        Renew
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleAudit(token.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Audit
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleAlerts(token.id)}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                          token.alertCount > 0
                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Alerts {token.alertCount > 0 ? `(${token.alertCount})` : ''}
                      </button>
                      <button
                        type="button"
                        onClick={() => void testConnection(token.id)}
                        disabled={
                          testingId === token.id || token.status !== 'active' || !isOwnToken
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                        title={
                          !isOwnToken
                            ? ownerOnlyActionTitle
                            : token.status === 'active'
                              ? t('testConnection')
                              : 'Renew this token before testing'
                        }
                      >
                        {testingId === token.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Terminal className="h-3 w-3" />
                        )}
                        {testingId === token.id ? t('testingConnection') : t('testConnection')}
                      </button>
                      <button
                        onClick={() => deleteToken(token.id)}
                        disabled={deletingId === token.id || token.status === 'revoked'}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                        title={t('revoke')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {expandedSetupId === token.id && setupByTokenId[token.id] && (
                    <div className="mt-3">
                      <McpSetupPanel
                        config={setupByTokenId[token.id]}
                        activeClient={activeClientFor(token.id)}
                        onActiveClientChange={(client) => setActiveClientFor(token.id, client)}
                        onCopyConfig={() =>
                          void copySetupConfig(setupByTokenId[token.id], activeClientFor(token.id))
                        }
                      />
                    </div>
                  )}
                  {token.status === 'active' &&
                    testResults[token.id] &&
                    newTokenSetup?.tokenId !== token.id && (
                      <ConnectionResultPanel result={testResults[token.id]} />
                    )}
                  {expandedAuditId === token.id && (
                    <div className="mt-3 rounded-md border border-border bg-neutral-50 p-3">
                      <p className="text-xs font-medium text-neutral-800">Audit trail</p>
                      {(auditByTokenId[token.id] ?? []).length === 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground">No audit events yet.</p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {(auditByTokenId[token.id] ?? []).map((event) => (
                            <li key={event.id} className="text-xs text-neutral-600">
                              <span className="font-medium text-neutral-800">{event.status}</span> ·{' '}
                              {event.method}
                              {event.toolName ? ` / ${event.toolName}` : ''} · {event.latencyMs} ms
                              · {event.ipAddress ?? 'unknown IP'} ·{' '}
                              <ClientTime iso={event.createdAt} style="dateTime" />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {expandedAlertsId === token.id && (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/60 p-3">
                      <p className="text-xs font-medium text-amber-900">Suspicious-use alerts</p>
                      {(alertsByTokenId[token.id] ?? []).length === 0 ? (
                        <p className="mt-2 text-xs text-amber-800">No open alerts.</p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {(alertsByTokenId[token.id] ?? []).map((alert) => (
                            <li
                              key={alert.id}
                              className="flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900"
                            >
                              <span>
                                <span className="font-medium">{alert.message}</span>
                                {alert.details ? ` ${alert.details}` : ''}
                              </span>
                              <button
                                type="button"
                                onClick={() => void acknowledgeAlert(token.id, alert.id)}
                                className="rounded border border-amber-300 bg-white px-2 py-1 font-medium text-amber-900 hover:bg-amber-100"
                              >
                                Acknowledge
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {tokens.length === 0 && !newTokenSetup && (
          <p className="mt-4 text-sm text-muted-foreground">{t('noTokens')}</p>
        )}
      </section>

      {isAdmin && (
        <>
          {/* Re-index section */}
          <section>
            <h3 className="text-base font-semibold">{t('reindex')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('reindexDescription')}</p>
            {reindexError && <p className="mt-2 text-sm text-destructive">{reindexError}</p>}
            <button
              onClick={reindex}
              disabled={reindexing}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${reindexing ? 'animate-spin' : ''}`} />
              {reindexing ? t('reindexing') : t('reindexButton')}
            </button>
          </section>

          {/* Regenerate Wiki section */}
          <section>
            <h3 className="text-base font-semibold">{t('regenerateWiki')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('regenerateWikiDescription')}</p>
            {regenerateWikiError && (
              <p className="mt-2 text-sm text-destructive">{regenerateWikiError}</p>
            )}
            <button
              onClick={regenerateWiki}
              disabled={regeneratingWiki}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition-colors"
            >
              <BookOpen className={`h-4 w-4 ${regeneratingWiki ? 'animate-pulse' : ''}`} />
              {regeneratingWiki ? t('regeneratingWiki') : t('regenerateWikiButton')}
            </button>
          </section>

          {/* Danger Zone section */}
          <section className="rounded-lg border border-red-200 bg-red-50/40">
            <div className="border-b border-red-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-red-700">{t('dangerZone')}</h3>
            </div>
            <div className="flex items-center justify-between px-4 py-4">
              <div>
                <p className="text-sm font-medium text-neutral-800">{t('deleteRepository')}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {t('deleteRepositoryDescription')}
                </p>
              </div>
              <button
                onClick={() => setShowDeleteDialog(true)}
                className="ml-6 shrink-0 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-600 hover:text-white hover:border-red-600"
              >
                {t('deleteRepository')}
              </button>
            </div>
          </section>
        </>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !deleting && setShowDeleteDialog(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl bg-white shadow-xl mx-4">
            <div className="px-6 py-5 border-b border-neutral-100">
              <h2 className="text-base font-semibold text-neutral-900">
                {t('deleteRepositoryConfirmTitle', { name: repositoryName })}
              </h2>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-neutral-600">{t('deleteRepositoryConfirmBody')}</p>
              {deleteError && <p className="mt-3 text-sm text-red-600">{deleteError}</p>}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-100">
              <button
                onClick={() => setShowDeleteDialog(false)}
                disabled={deleting}
                className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
              >
                {t('cancel')}
              </button>
              <button
                onClick={deleteRepository}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? t('deleting') : t('deleteRepository')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
