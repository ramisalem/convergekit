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
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Loader2,
  LockKeyhole,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
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
  { key: 'generic', label: 'Generic JSON' },
]

function configToText(config: McpTokenConfig, activeClient: McpClientConfigKey) {
  return JSON.stringify(config.clientConfigs[activeClient].config, null, 2)
}

function CopyButton({
  text,
  label = 'Copy',
  className = 'rounded p-1 text-muted-foreground hover:text-foreground transition-colors',
}: {
  text: string
  label?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className={className}
      title={label}
      type="button"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {label !== 'Copy' ? <span>{copied ? 'Copied' : label}</span> : null}
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
    ? 'border-[var(--convergekit-align-ok-bd)] bg-[var(--convergekit-align-ok-bg)] text-[var(--convergekit-align-ok-fg)]'
    : token.status === 'revoked'
      ? 'border-[var(--convergekit-align-conflict-bd)] bg-[var(--convergekit-align-conflict-bg)] text-[var(--convergekit-align-conflict-fg)]'
      : token.status === 'expired'
        ? 'border-[var(--convergekit-align-stale-bd)] bg-[var(--convergekit-align-stale-bg)] text-[var(--convergekit-align-stale-fg)]'
        : token.alertCount > 0
          ? 'border-[var(--convergekit-align-conflict-bd)] bg-[var(--convergekit-align-conflict-bg)] text-[var(--convergekit-align-conflict-fg)]'
          : used
            ? 'border-[var(--convergekit-align-ok-bd)] bg-[var(--convergekit-align-ok-bg)] text-[var(--convergekit-align-ok-fg)]'
            : 'border-[var(--convergekit-line)] bg-[var(--convergekit-bg-3)] text-[var(--convergekit-ink-3)]'

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {passed ? <CheckCircle2 className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
      {passed
        ? t('connectionPassed')
        : token.status === 'revoked'
          ? 'Revoked'
          : token.status === 'expired'
            ? 'Expired'
            : token.alertCount > 0
              ? 'Suspicious use'
              : used
                ? 'Healthy'
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
  return (
    <div className="rounded-[var(--convergekit-radius-lg)] border border-[#fde68a] bg-gradient-to-b from-[#fffbeb] to-white shadow-sm">
      <div className="flex items-start gap-3.5 px-5 py-4">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-[#fef3c7] text-[#92400e]">
          <LockKeyhole className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--convergekit-ink)]">
            Token created — copy it now
          </p>
          <p className="mt-0.5 text-[12.5px] text-[var(--convergekit-ink-3)]">
            This token is shown <strong>once</strong>. We&apos;ve stored its fingerprint, not the
            value.
          </p>

          <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-[var(--convergekit-line)] bg-white px-3 py-2.5">
            <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-[var(--convergekit-ink)]">
              {setup.token}
            </code>
            <CopyButton
              text={setup.token}
              label="Copy token"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--convergekit-line)] bg-white px-2.5 text-xs font-medium text-[var(--convergekit-ink-2)] transition-colors hover:bg-[var(--convergekit-bg-3)]"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3.5">
            <label className="text-xs text-[var(--convergekit-ink-3)]">Setup for</label>
            <div className="inline-flex gap-0.5 rounded-lg bg-[var(--convergekit-bg-3)] p-0.5">
              {MCP_CLIENTS.map((client) => (
                <button
                  key={client.key}
                  type="button"
                  onClick={() => onActiveClientChange(client.key)}
                  className={`h-6 rounded-md border px-2.5 text-[11.5px] font-medium transition-colors ${
                    activeClient === client.key
                      ? 'border-[var(--convergekit-line)] bg-white text-[var(--convergekit-ink)]'
                      : 'border-transparent bg-transparent text-[var(--convergekit-ink-3)] hover:text-[var(--convergekit-ink)]'
                  }`}
                >
                  {client.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onCopyConfig}
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--convergekit-line)] bg-white px-2.5 text-xs font-medium text-[var(--convergekit-ink-2)] transition-colors hover:bg-[var(--convergekit-bg-3)]"
            >
              <Copy className="h-3 w-3" />
              Copy config
            </button>
            <button
              type="button"
              onClick={onTest}
              disabled={testing}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--convergekit-line)] bg-white px-2.5 text-xs font-medium text-[var(--convergekit-ink-2)] transition-colors hover:bg-[var(--convergekit-bg-3)] disabled:opacity-60"
            >
              {testing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              {testing ? 'Testing...' : 'Test connection'}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="grid h-[26px] w-[26px] flex-none place-items-center rounded-md text-[var(--convergekit-ink-4)] transition-colors hover:bg-[var(--convergekit-bg-3)] hover:text-[var(--convergekit-ink)]"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {testResult && <div className="px-5 pb-4"><ConnectionResultPanel result={testResult} /></div>}
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
  const [showCreateTokenForm, setShowCreateTokenForm] = useState(false)
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
      setShowCreateTokenForm(false)
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
    <div className="settings-tab-shell flex w-full flex-col gap-3.5 pb-10 pt-5">
      {newTokenSetup && (
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
      )}

      {/* MCP Tokens section */}
      <section className="settings-token-card overflow-hidden rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--convergekit-line-2)] px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--convergekit-ink)]">
              {t('mcpTokens')}
            </h3>
            <p className="mt-0.5 text-[12.5px] text-[var(--convergekit-ink-3)]">
              Issue scoped tokens for Claude Desktop, Cursor, or other MCP clients.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin && ownerOptions.length > 0 && (
              <select
                id="mcp-token-owner-filter"
                value={ownerFilterUserId}
                onChange={(e) => setOwnerFilterUserId(e.target.value)}
                className="h-9 w-[180px] rounded-md border border-[var(--convergekit-line)] bg-white px-3 text-sm text-[var(--convergekit-ink-2)] outline-none transition-colors focus:border-[var(--convergekit-ink)]"
              >
                <option value="all">All token owners</option>
                {ownerOptions.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name} ({owner.email})
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setShowCreateTokenForm((current) => !current)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--convergekit-ink)] px-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              New token
            </button>
          </div>
        </div>

        {showCreateTokenForm && (
          <form
            onSubmit={createToken}
            className="border-b border-[var(--convergekit-line-2)] bg-[var(--convergekit-bg-2)] px-5 py-4"
          >
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder={t('tokenLabelPlaceholder')}
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="min-w-64 flex-1 rounded-md border border-[var(--convergekit-line)] bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--convergekit-ink)]"
              />
              <select
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value) as 7 | 30 | 90)}
                className="rounded-md border border-[var(--convergekit-line)] bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--convergekit-ink)]"
                aria-label="Token expiry"
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
              <button
                type="submit"
                disabled={creating || !newLabel.trim() || selectedScopes.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--convergekit-ink)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {creating ? t('creating') : t('createToken')}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {MCP_SCOPES.map((entry) => (
                <label
                  key={entry.scope}
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--convergekit-line)] bg-white px-2.5 py-1.5 text-xs text-[var(--convergekit-ink-2)]"
                >
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(entry.scope)}
                    onChange={() => toggleScope(entry.scope)}
                  />
                  <span>
                    {entry.label} <code className="text-[var(--convergekit-ink-4)]">{entry.scope}</code>
                  </span>
                </label>
              ))}
            </div>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </form>
        )}

        <div className="overflow-x-auto pb-1">
          <table className="settings-token-table w-full min-w-[1040px] table-fixed border-separate border-spacing-0 text-left">
            <colgroup>
              <col className="w-[17%]" />
              <col className="w-[10%]" />
              <col className="w-[26%]" />
              <col className="w-[9%]" />
              <col className="w-[11%]" />
              <col className="w-[10%]" />
              <col className="w-[17%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-[var(--convergekit-line-2)] text-[11px] uppercase tracking-[0.06em] text-[var(--convergekit-ink-4)]">
                <th>Label</th>
                <th>Owner</th>
                <th>Scopes</th>
                <th>Last used</th>
                <th>Health</th>
                <th>Expires</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tokens.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-5 text-sm text-[var(--convergekit-ink-3)]">
                    {t('noTokens')}
                  </td>
                </tr>
              ) : (
                tokens.map((token) => {
                  const isOwnToken = token.owner.id === currentUserId
                  const ownerOnlyActionTitle = isOwnToken
                    ? undefined
                    : 'Only the token owner can use this action'

                  return (
                    <tr
                      key={token.id}
                      className="border-b border-[var(--convergekit-line-2)] last:border-b-0"
                    >
                      <td className="px-5 py-3 align-top">
                        <div className="font-medium text-[var(--convergekit-ink)]">
                          {token.label}
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-[var(--convergekit-ink-4)]">
                          fp:{token.fingerprint}
                        </div>
                      </td>
                      <td className="min-w-0 px-5 py-3 align-top text-[12.5px] text-[var(--convergekit-ink-2)]">
                        <span className="block truncate" title={token.owner.name}>
                          {token.owner.id === currentUserId ? 'you' : token.owner.name}
                        </span>
                        {isAdmin && token.owner.id !== currentUserId && (
                          <span className="mt-1 block text-[11px] text-[var(--convergekit-ink-4)]">
                            Created by {token.owner.name}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 align-top">
                        <div className="flex flex-wrap gap-1">
                          {token.scopes.map((scope) => (
                            <span
                              key={scope}
                              className="rounded-full border border-[var(--convergekit-line)] bg-[var(--convergekit-bg-3)] px-2 py-0.5 font-mono text-[11px] text-[var(--convergekit-ink-2)]"
                            >
                              {scope}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3 align-top text-[12.5px] whitespace-nowrap text-[var(--convergekit-ink-3)]">
                        <ClientTime iso={token.lastUsedAt} style="relative" fallback={t('never')} />
                      </td>
                      <td className="settings-token-health-cell px-5 py-3 align-top">
                        <TokenHealthBadge token={token} result={testResults[token.id] ?? null} />
                      </td>
                      <td
                        className={`px-5 py-3 align-top text-[12.5px] whitespace-nowrap ${
                          token.status === 'expired'
                            ? 'text-[var(--convergekit-align-conflict-fg)]'
                            : 'text-[var(--convergekit-ink-3)]'
                        }`}
                      >
                        <ClientTime iso={token.expiresAt} style="relative" />
                      </td>
                      <td className="px-5 py-3 text-right align-top">
                        <div className="settings-token-actions">
                          {token.alertCount > 0 && (
                            <button
                              type="button"
                              onClick={() => void toggleAlerts(token.id)}
                              className="rounded-md px-2 py-1 text-xs text-[var(--convergekit-align-stale-fg)] transition-colors hover:bg-[var(--convergekit-align-stale-bg)]"
                            >
                              Alerts ({token.alertCount})
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void toggleSetup(token.id)}
                            disabled={!isOwnToken}
                            className="rounded-md px-2 py-1 text-xs text-[var(--convergekit-ink-3)] transition-colors hover:bg-[var(--convergekit-bg-3)] hover:text-[var(--convergekit-ink)] disabled:opacity-40"
                            title={ownerOnlyActionTitle ?? t('clientSetup')}
                          >
                            {expandedSetupId === token.id ? t('hideSetup') : t('setup')}
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleAudit(token.id)}
                            className="rounded-md px-2 py-1 text-xs text-[var(--convergekit-ink-3)] transition-colors hover:bg-[var(--convergekit-bg-3)] hover:text-[var(--convergekit-ink)]"
                          >
                            Audit
                          </button>
                          {token.status !== 'active' ? (
                            <button
                              type="button"
                              onClick={() => void renewToken(token.id)}
                              disabled={creating || !isOwnToken}
                              className="rounded-md px-2 py-1 text-xs text-[var(--convergekit-ink-3)] transition-colors hover:bg-[var(--convergekit-bg-3)] hover:text-[var(--convergekit-ink)] disabled:opacity-40"
                              title={ownerOnlyActionTitle ?? 'Renew token'}
                            >
                              Renew
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => deleteToken(token.id)}
                              disabled={deletingId === token.id || !isOwnToken}
                              className="rounded-md px-2 py-1 text-xs text-[var(--convergekit-ink-3)] transition-colors hover:bg-red-50 hover:text-destructive disabled:opacity-40"
                              title={ownerOnlyActionTitle ?? t('revoke')}
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {tokens.map((token) => (
          <div key={`${token.id}-expansions`} className="px-5">
            {expandedSetupId === token.id && setupByTokenId[token.id] && (
              <div className="border-t border-[var(--convergekit-line-2)] py-3">
                <McpSetupPanel
                  config={setupByTokenId[token.id]}
                  activeClient={activeClientFor(token.id)}
                  onActiveClientChange={(client) => setActiveClientFor(token.id, client)}
                  onCopyConfig={() =>
                    void copySetupConfig(setupByTokenId[token.id], activeClientFor(token.id))
                  }
                />
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void testConnection(token.id)}
                    disabled={testingId === token.id || token.status !== 'active'}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--convergekit-line)] bg-white px-2.5 text-xs font-medium text-[var(--convergekit-ink-2)] transition-colors hover:bg-[var(--convergekit-bg-3)] disabled:opacity-50"
                  >
                    {testingId === token.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                    {testingId === token.id ? t('testingConnection') : 'Test connection'}
                  </button>
                  {token.status !== 'active' && (
                    <button
                      type="button"
                      onClick={() => void renewToken(token.id)}
                      disabled={creating}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--convergekit-line)] bg-white px-2.5 text-xs font-medium text-[var(--convergekit-ink-2)] transition-colors hover:bg-[var(--convergekit-bg-3)] disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${creating ? 'animate-spin' : ''}`} />
                      Renew token
                    </button>
                  )}
                </div>
              </div>
            )}
            {token.status === 'active' &&
              testResults[token.id] &&
              newTokenSetup?.tokenId !== token.id && (
                <div className="border-t border-[var(--convergekit-line-2)] py-3">
                  <ConnectionResultPanel result={testResults[token.id]} />
                </div>
              )}
            {expandedAuditId === token.id && (
              <div className="border-t border-[var(--convergekit-line-2)] py-3">
                <div className="rounded-md border border-[var(--convergekit-line)] bg-[var(--convergekit-bg-2)] p-3">
                  <p className="text-xs font-medium text-[var(--convergekit-ink)]">Audit trail</p>
                  {(auditByTokenId[token.id] ?? []).length === 0 ? (
                    <p className="mt-2 text-xs text-[var(--convergekit-ink-3)]">
                      No audit events yet.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {(auditByTokenId[token.id] ?? []).map((event) => (
                        <li key={event.id} className="text-xs text-[var(--convergekit-ink-3)]">
                          <span className="font-medium text-[var(--convergekit-ink)]">
                            {event.status}
                          </span>{' '}
                          · {event.method}
                          {event.toolName ? ` / ${event.toolName}` : ''} · {event.latencyMs} ms ·{' '}
                          {event.ipAddress ?? 'unknown IP'} ·{' '}
                          <ClientTime iso={event.createdAt} style="dateTime" />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
            {expandedAlertsId === token.id && (
              <div className="border-t border-[var(--convergekit-line-2)] py-3">
                <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3">
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
              </div>
            )}
          </div>
        ))}
      </section>

      {isAdmin && (
        <>
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {/* Re-index section */}
            <section className="rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white shadow-sm">
              <div className="border-b border-[var(--convergekit-line-2)] px-5 py-4">
                <h3 className="text-sm font-semibold text-[var(--convergekit-ink)]">
                  Re-index repository
                </h3>
                <p className="mt-0.5 text-[12.5px] text-[var(--convergekit-ink-3)]">
                  Re-clone, parse, and embed everything from scratch.
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <p className="text-xs text-[var(--convergekit-ink-4)]">
                  Last full index: use repository status above
                </p>
                {reindexError && <p className="text-xs text-destructive">{reindexError}</p>}
                <button
                  type="button"
                  onClick={reindex}
                  disabled={reindexing}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[var(--convergekit-line)] bg-white px-3 text-sm font-medium text-[var(--convergekit-ink-2)] transition-colors hover:bg-[var(--convergekit-bg-3)] disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${reindexing ? 'animate-spin' : ''}`} />
                  {reindexing ? t('reindexing') : 'Re-index'}
                </button>
              </div>
            </section>

            {/* Regenerate Wiki section */}
            <section className="rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white shadow-sm">
              <div className="border-b border-[var(--convergekit-line-2)] px-5 py-4">
                <h3 className="text-sm font-semibold text-[var(--convergekit-ink)]">
                  Regenerate Wiki
                </h3>
                <p className="mt-0.5 text-[12.5px] text-[var(--convergekit-ink-3)]">
                  Skip indexing; rebuild pages from current chunks.
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <p className="text-xs text-[var(--convergekit-ink-4)]">
                  Rebuilds wiki pages from current evidence
                </p>
                {regenerateWikiError && (
                  <p className="text-xs text-destructive">{regenerateWikiError}</p>
                )}
                <button
                  type="button"
                  onClick={regenerateWiki}
                  disabled={regeneratingWiki}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[var(--convergekit-line)] bg-white px-3 text-sm font-medium text-[var(--convergekit-ink-2)] transition-colors hover:bg-[var(--convergekit-bg-3)] disabled:opacity-50"
                >
                  <Sparkles className={`h-3.5 w-3.5 ${regeneratingWiki ? 'animate-pulse' : ''}`} />
                  {regeneratingWiki ? t('regeneratingWiki') : 'Regenerate'}
                </button>
              </div>
            </section>
          </div>

          {/* Danger Zone section */}
          <section className="rounded-[var(--convergekit-radius-lg)] border border-[#fecaca] bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-[#b91c1c]">Danger zone</h3>
                <p className="mt-0.5 text-[12.5px] text-[var(--convergekit-ink-3)]">
                  Deleting a repository removes all indexed data, wiki pages, chats, and tokens.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteDialog(true)}
                className="inline-flex h-9 items-center rounded-md bg-[#dc2626] px-3 text-sm font-medium text-white transition-colors hover:bg-[#b91c1c]"
              >
                Delete repository
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
