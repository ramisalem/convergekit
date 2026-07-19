'use client'

import {
  AlertsPanel,
  AuditTrailPanel,
  configToText,
  ConnectionResultPanel,
  McpSetupPanel,
  NewTokenBanner,
  TokenHealthBadge,
  type NewTokenSetup,
} from '@/components/settings/mcp-token-widgets'
import { ClientTime } from '@/components/ui/client-time'
import { useUser } from '@/components/user-nav'
import {
  ApiError,
  meCiTokensApi,
  type LegacyCiTokenListItem,
  type McpClientConfigKey,
  type McpConnectionTestResult,
  type McpScope,
  type McpTokenAlert,
  type McpTokenAuditEvent,
  type McpTokenConfig,
  type McpTokenListItem,
} from '@/lib/api-client'
import { Loader2, Play, Plus, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

const SCOPE_OPTIONS: McpScope[] = ['repo:read', 'docs:search', 'files:read']

export function CiTokensAccountPanel() {
  const t = useTranslations('ciTokens')
  const { user, loading: userLoading } = useUser()
  const ciTokensEnabled = user?.ciTokensEnabled === true

  // Own (user-level, self-service) tokens
  const [tokens, setTokens] = useState<McpTokenListItem[]>([])
  const [tokensLoaded, setTokensLoaded] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [expiresInDays, setExpiresInDays] = useState<7 | 30 | 90>(30)
  const [selectedScopes, setSelectedScopes] = useState<McpScope[]>([...SCOPE_OPTIONS])
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
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [renewingId, setRenewingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Legacy (grandfathered, repo-scoped) tokens — revoke-only, shown regardless of the flag
  const [legacyTokens, setLegacyTokens] = useState<LegacyCiTokenListItem[]>([])
  const [legacyLoaded, setLegacyLoaded] = useState(false)
  const [legacyError, setLegacyError] = useState<string | null>(null)
  const [legacyRevokingId, setLegacyRevokingId] = useState<string | null>(null)

  const loadTokens = useCallback(async () => {
    if (!ciTokensEnabled) return
    try {
      const { tokens } = await meCiTokensApi.list()
      setTokens(tokens)
      setError(null)
    } catch {
      setError('Failed to load CI / automation tokens.')
    } finally {
      setTokensLoaded(true)
    }
  }, [ciTokensEnabled])

  useEffect(() => {
    void loadTokens()
  }, [loadTokens])

  const loadLegacyTokens = useCallback(async () => {
    try {
      const { tokens } = await meCiTokensApi.listLegacy()
      setLegacyTokens(tokens)
      setLegacyError(null) // a successful retry must clear the error card
    } catch {
      setLegacyError('Failed to load legacy tokens.')
    } finally {
      setLegacyLoaded(true)
    }
  }, [])

  useEffect(() => {
    void loadLegacyTokens()
  }, [loadLegacyTokens])

  function activeClientFor(tokenId: string) {
    return activeClientByTokenId[tokenId] ?? 'claudeDesktop'
  }

  function setActiveClientFor(tokenId: string, client: McpClientConfigKey) {
    setActiveClientByTokenId((prev) => ({ ...prev, [tokenId]: client }))
  }

  async function copySetupConfig(config: McpTokenConfig, activeClient: McpClientConfigKey) {
    await navigator.clipboard.writeText(configToText(config, activeClient))
  }

  function toggleScope(scope: McpScope) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((value) => value !== scope) : [...prev, scope],
    )
  }

  async function createToken() {
    if (!newLabel.trim() || creating) return
    setCreating(true)
    setError(null)
    try {
      const created = await meCiTokensApi.create({
        label: newLabel.trim(),
        expiresInDays,
        scopes: selectedScopes,
      })
      setNewTokenSetup(created)
      setSetupByTokenId((prev) => ({ ...prev, [created.tokenId]: created }))
      setActiveClientFor(created.tokenId, 'claudeDesktop')
      setShowCreateForm(false)
      setNewLabel('')
      await loadTokens()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create the token.')
    } finally {
      setCreating(false)
    }
  }

  async function renewToken(tokenId: string) {
    // Dedicated in-flight state (like deletingId): a renew must not lock the
    // create form, but both mint a token banner, so they still exclude each other.
    if (creating || renewingId) return
    setRenewingId(tokenId)
    setError(null)
    try {
      const renewed = await meCiTokensApi.renew(tokenId)
      setNewTokenSetup(renewed)
      setSetupByTokenId((prev) => ({ ...prev, [renewed.tokenId]: renewed }))
      setActiveClientFor(renewed.tokenId, 'claudeDesktop')
      await loadTokens()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to renew the token.')
    } finally {
      setRenewingId(null)
    }
  }

  async function revokeToken(tokenId: string) {
    setDeletingId(tokenId)
    setError(null)
    try {
      await meCiTokensApi.revoke(tokenId)
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
      setAuditByTokenId((prev) => {
        const next = { ...prev }
        delete next[tokenId]
        return next
      })
      setAlertsByTokenId((prev) => {
        const next = { ...prev }
        delete next[tokenId]
        return next
      })
      if (expandedSetupId === tokenId) setExpandedSetupId(null)
      if (expandedAuditId === tokenId) setExpandedAuditId(null)
      if (expandedAlertsId === tokenId) setExpandedAlertsId(null)
      if (newTokenSetup?.tokenId === tokenId) setNewTokenSetup(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to revoke the token.')
    } finally {
      setDeletingId(null)
    }
  }

  async function testConnection(token: McpTokenListItem) {
    if (token.status !== 'active') return
    setTestingId(token.id)
    try {
      const rawToken = newTokenSetup?.tokenId === token.id ? newTokenSetup.token : undefined
      const result = await meCiTokensApi.testConnection(token.id, rawToken)
      setTestResults((prev) => ({ ...prev, [token.id]: result }))
      await loadTokens()
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [token.id]: {
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

  async function toggleSetup(tokenId: string) {
    if (expandedSetupId === tokenId) {
      setExpandedSetupId(null)
      return
    }
    setExpandedSetupId(tokenId)
    if (setupByTokenId[tokenId]) return
    try {
      const data = await meCiTokensApi.getConfig(tokenId)
      setSetupByTokenId((prev) => ({ ...prev, [tokenId]: data }))
    } catch {
      setError('Failed to load setup instructions.')
      setExpandedSetupId(null)
    }
  }

  async function toggleAudit(tokenId: string) {
    if (expandedAuditId === tokenId) {
      setExpandedAuditId(null)
      return
    }
    setExpandedAuditId(tokenId)
    if (auditByTokenId[tokenId]) return
    try {
      const { events } = await meCiTokensApi.listAudit(tokenId)
      setAuditByTokenId((prev) => ({ ...prev, [tokenId]: events }))
    } catch {
      setError('Failed to load the audit trail.')
      setExpandedAuditId(null)
    }
  }

  async function toggleAlerts(tokenId: string) {
    if (expandedAlertsId === tokenId) {
      setExpandedAlertsId(null)
      return
    }
    setExpandedAlertsId(tokenId)
    try {
      const { alerts } = await meCiTokensApi.listAlerts(tokenId)
      setAlertsByTokenId((prev) => ({ ...prev, [tokenId]: alerts }))
    } catch {
      setError('Failed to load alerts.')
      setExpandedAlertsId(null)
    }
  }

  async function acknowledgeAlert(tokenId: string, alertId: string) {
    try {
      await meCiTokensApi.acknowledgeAlert(tokenId, alertId)
      const { alerts } = await meCiTokensApi.listAlerts(tokenId)
      setAlertsByTokenId((prev) => ({ ...prev, [tokenId]: alerts }))
      await loadTokens()
    } catch {
      setError('Failed to acknowledge the alert.')
    }
  }

  async function revokeLegacyToken(tokenId: string) {
    setLegacyRevokingId(tokenId)
    setLegacyError(null)
    try {
      await meCiTokensApi.revokeLegacy(tokenId)
      await loadLegacyTokens()
    } catch (err) {
      setLegacyError(err instanceof ApiError ? err.message : 'Failed to revoke the token.')
    } finally {
      setLegacyRevokingId(null)
    }
  }

  // When the flag is on, wait for the own-token list too — otherwise the table
  // flashes "No tokens yet" for the duration of the first fetch.
  const ready = !userLoading && legacyLoaded && (!ciTokensEnabled || tokensLoaded)
  const hasLegacy = legacyTokens.length > 0

  return (
    <div className="flex w-full flex-col gap-3.5">
      <div>
        <h1 className="text-lg font-semibold text-[var(--convergekit-ink)]">{t('title')}</h1>
        <p className="mt-1 text-sm text-[var(--convergekit-ink-3)]">
          Create and manage your own CI / automation tokens for scripts, pipelines, and other
          automation. A token acts as you and can read every repository you are assigned to.
        </p>
      </div>

      {!ready && (
        <div className="h-32 w-full animate-pulse rounded-[var(--convergekit-radius-lg)] bg-[var(--convergekit-bg-3)]" />
      )}

      {/* !legacyError: while the legacy fetch is failed we cannot truthfully claim the
          account has nothing — the retry card below owns that state instead. */}
      {ready && !ciTokensEnabled && !hasLegacy && !legacyError && (
        <section className="rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white p-6 shadow-sm">
          <p className="text-sm text-[var(--convergekit-ink-3)]">
            CI / automation tokens aren't enabled for your account. Ask an admin to enable the CI /
            automation token capability for you.
          </p>
        </section>
      )}

      {ready && ciTokensEnabled && newTokenSetup && (
        <NewTokenBanner
          setup={newTokenSetup}
          activeClient={activeClientFor(newTokenSetup.tokenId)}
          onActiveClientChange={(client) => setActiveClientFor(newTokenSetup.tokenId, client)}
          onCopyConfig={() =>
            void copySetupConfig(newTokenSetup, activeClientFor(newTokenSetup.tokenId))
          }
          testResult={testResults[newTokenSetup.tokenId] ?? null}
          testing={testingId === newTokenSetup.tokenId}
          onTest={() => void testConnection(newTokenSetup.tokenDetails)}
          onDismiss={() => setNewTokenSetup(null)}
        />
      )}

      {ready && ciTokensEnabled && (
        <section className="overflow-hidden rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--convergekit-line-2)] px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--convergekit-ink)]">Your tokens</h2>
              <p className="mt-0.5 text-[12.5px] text-[var(--convergekit-ink-3)]">
                Tokens you create are scoped to your own repositories and permissions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateForm((current) => !current)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--convergekit-ink)] px-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              New token
            </button>
          </div>

          {error && <p className="px-5 pt-3 text-sm text-destructive">{error}</p>}

          {showCreateForm && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void createToken()
              }}
              className="border-b border-[var(--convergekit-line-2)] bg-[var(--convergekit-bg-2)] px-5 py-4"
            >
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  placeholder={t('tokenLabelPlaceholder')}
                  aria-label="Token label"
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
                  disabled={creating || !newLabel.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--convergekit-ink)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {creating ? t('creating') : t('createToken')}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {SCOPE_OPTIONS.map((scope) => (
                  <label
                    key={scope}
                    className="inline-flex items-center gap-2 rounded-md border border-[var(--convergekit-line)] bg-white px-2.5 py-1.5 text-xs text-[var(--convergekit-ink-2)]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedScopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                    />
                    <code className="text-[var(--convergekit-ink-4)]">{scope}</code>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[11.5px] text-[var(--convergekit-ink-4)]">
                Uncheck every scope to create a list-only token.
              </p>
            </form>
          )}

          <div className="overflow-x-auto pb-1">
            <table className="ci-token-table w-full min-w-[900px] table-fixed border-separate border-spacing-0 text-left">
              <colgroup>
                <col className="w-[26%]" />
                <col className="w-[22%]" />
                <col className="w-[11%]" />
                <col className="w-[12%]" />
                <col className="w-[11%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-[var(--convergekit-line-2)] text-[11px] uppercase tracking-[0.06em] text-[var(--convergekit-ink-4)] [&>th]:px-5 [&>th]:py-2.5 [&>th]:font-medium">
                  <th>Label</th>
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
                    <td colSpan={6} className="px-5 py-5 text-sm text-[var(--convergekit-ink-3)]">
                      {t('noTokens')}
                    </td>
                  </tr>
                ) : (
                  tokens.map((token) => (
                    <tr
                      key={token.id}
                      className="border-b border-[var(--convergekit-line-2)] last:border-b-0"
                    >
                      <td className="px-5 py-3 align-top whitespace-nowrap">
                        <div className="font-medium text-[var(--convergekit-ink)]">{token.label}</div>
                        <div className="mt-1 font-mono text-[11px] text-[var(--convergekit-ink-4)]">
                          fp:{token.fingerprint}
                        </div>
                      </td>
                      <td className="px-5 py-3 align-top">
                        <div className="flex flex-wrap gap-1">
                          {token.scopes.length === 0 ? (
                            <span className="text-[12.5px] text-[var(--convergekit-ink-3)]">
                              List repositories only
                            </span>
                          ) : (
                            token.scopes.map((scope) => (
                              <span
                                key={scope}
                                className="rounded-full border border-[var(--convergekit-line)] bg-[var(--convergekit-bg-3)] px-2 py-0.5 font-mono text-[11px] text-[var(--convergekit-ink-2)]"
                              >
                                {scope}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 align-top text-[12.5px] whitespace-nowrap text-[var(--convergekit-ink-3)]">
                        <ClientTime iso={token.lastUsedAt} style="relative" fallback={t('never')} />
                      </td>
                      <td className="ci-token-health-cell px-5 py-3 align-top">
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
                        <div className="ci-token-actions">
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
                            className="rounded-md px-2 py-1 text-xs text-[var(--convergekit-ink-3)] transition-colors hover:bg-[var(--convergekit-bg-3)] hover:text-[var(--convergekit-ink)]"
                            title={t('clientSetup')}
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
                          {/* Renew only for EXPIRED tokens — the server rejects renewing a
                              revoked one (revoked credentials never rotate back to life). */}
                          {token.status === 'expired' && (
                            <button
                              type="button"
                              onClick={() => void renewToken(token.id)}
                              disabled={creating || renewingId !== null}
                              className="rounded-md px-2 py-1 text-xs text-[var(--convergekit-ink-3)] transition-colors hover:bg-[var(--convergekit-bg-3)] hover:text-[var(--convergekit-ink)] disabled:opacity-40"
                              title="Renew token"
                            >
                              Renew
                            </button>
                          )}
                          {token.status !== 'revoked' && (
                            <button
                              type="button"
                              onClick={() => void revokeToken(token.id)}
                              disabled={deletingId === token.id}
                              className="inline-flex items-center rounded-md border border-destructive/40 px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
                              title={t('revoke')}
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
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
                      onClick={() => void testConnection(token)}
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
                    {token.status === 'expired' && (
                      <button
                        type="button"
                        onClick={() => void renewToken(token.id)}
                        disabled={creating || renewingId !== null}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--convergekit-line)] bg-white px-2.5 text-xs font-medium text-[var(--convergekit-ink-2)] transition-colors hover:bg-[var(--convergekit-bg-3)] disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-3 w-3 ${renewingId === token.id ? 'animate-spin' : ''}`}
                        />
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
                <AuditTrailPanel events={auditByTokenId[token.id] ?? []} />
              )}
              {expandedAlertsId === token.id && (
                <AlertsPanel
                  alerts={alertsByTokenId[token.id] ?? []}
                  onAcknowledge={(alertId) => void acknowledgeAlert(token.id, alertId)}
                />
              )}
            </div>
          ))}
        </section>
      )}

      {/* Rendered OUTSIDE the hasLegacy gate: a failed legacy fetch leaves the list empty,
          and the error must not vanish with the section it belongs to. */}
      {ready && legacyError && !hasLegacy && (
        <section className="rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white p-6 shadow-sm">
          <p className="text-sm text-destructive">
            Couldn't load your legacy CI / automation tokens: {legacyError}
          </p>
          <button
            type="button"
            onClick={() => void loadLegacyTokens()}
            className="mt-3 inline-flex h-8 items-center rounded-md border border-[var(--convergekit-line)] bg-white px-2.5 text-xs font-medium text-[var(--convergekit-ink-2)] transition-colors hover:bg-[var(--convergekit-bg-3)]"
          >
            Retry
          </button>
        </section>
      )}

      {ready && !ciTokensEnabled && hasLegacy && (
        <p className="text-sm text-[var(--convergekit-ink-3)]">
          Creating new CI / automation tokens isn't enabled for your account — ask an admin to
          enable the capability if you need a new token. You can still manage your existing legacy
          tokens below.
        </p>
      )}

      {ready && hasLegacy && (
        <section className="overflow-hidden rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white shadow-sm">
          {/* Legacy tokens — revoke-only, no renew/test/config */}
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--convergekit-line-2)] px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--convergekit-ink)]">Legacy tokens</h2>
              <p className="mt-0.5 text-[12.5px] text-[var(--convergekit-ink-3)]">
                Grandfathered repository-scoped tokens created before per-user CI tokens existed.
                You can revoke them below; new legacy tokens can no longer be created.
              </p>
            </div>
          </div>

          {legacyError && <p className="px-5 pt-3 text-sm text-destructive">{legacyError}</p>}

          <div className="overflow-x-auto pb-1">
            <table className="w-full min-w-[760px] table-fixed border-separate border-spacing-0 text-left">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[18%]" />
                <col className="w-[14%]" />
                <col className="w-[16%]" />
                <col className="w-[10%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-[var(--convergekit-line-2)] text-[11px] uppercase tracking-[0.06em] text-[var(--convergekit-ink-4)] [&>th]:px-5 [&>th]:py-2.5 [&>th]:font-medium">
                  <th>Label</th>
                  <th>Repository</th>
                  <th>Status</th>
                  <th>Last used</th>
                  <th>Alerts</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {legacyTokens.map((token) => (
                  <tr
                    key={token.id}
                    className="border-b border-[var(--convergekit-line-2)] last:border-b-0"
                  >
                    <td className="px-5 py-3 align-top whitespace-nowrap">
                      <div className="font-medium text-[var(--convergekit-ink)]">{token.label}</div>
                      <div className="mt-1 font-mono text-[11px] text-[var(--convergekit-ink-4)]">
                        fp:{token.fingerprint}
                      </div>
                    </td>
                    <td className="min-w-0 px-5 py-3 align-top text-[12.5px] text-[var(--convergekit-ink-2)]">
                      <span className="block truncate" title={token.repository.name}>
                        {token.repository.name}
                      </span>
                    </td>
                    <td className="px-5 py-3 align-top text-[12.5px] text-[var(--convergekit-ink-2)] capitalize">
                      {token.status}
                    </td>
                    <td className="px-5 py-3 align-top text-[12.5px] whitespace-nowrap text-[var(--convergekit-ink-3)]">
                      <ClientTime iso={token.lastUsedAt} style="relative" fallback={t('never')} />
                    </td>
                    <td className="px-5 py-3 align-top text-[12.5px] text-[var(--convergekit-ink-3)]">
                      {token.alertCount > 0 ? token.alertCount : '—'}
                    </td>
                    <td className="px-5 py-3 text-right align-top">
                      {token.status !== 'revoked' && (
                        <button
                          type="button"
                          onClick={() => void revokeLegacyToken(token.id)}
                          disabled={legacyRevokingId === token.id}
                          className="inline-flex items-center rounded-md border border-destructive/40 px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
                          title={t('revoke')}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
