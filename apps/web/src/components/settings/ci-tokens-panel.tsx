'use client'

import { ClientTime } from '@/components/ui/client-time'
import {
  adminCiTokensApi,
  ApiError,
  type AdminLegacyCiTokenListItem,
  type McpClientConfigKey,
  type McpTokenAlert,
  type McpTokenAuditEvent,
  type McpTokenConfig,
  type McpTokenListItem,
} from '@/lib/api-client'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import {
  AlertsPanel,
  AuditTrailPanel,
  configToText,
  McpSetupPanel,
  TokenHealthBadge,
} from './mcp-token-widgets'

// Oversight dashboard: every user's CI / automation tokens, across both the
// current user-level shape and legacy grandfathered repo-scoped tokens. Revoke
// and inspect (config/audit/alerts) are the only actions here — creating,
// renewing, and testing a token stay self-service for the token's own owner,
// wired into the account panel instead (/account/ci-tokens).

// Crash-window anomaly: repository deletion is supposed to revoke its legacy
// tokens, so an ACTIVE token on a soft-deleted repository means that cleanup
// was interrupted — exactly the state oversight exists to catch.
function isAnomalousLegacyToken(token: AdminLegacyCiTokenListItem) {
  return Boolean(token.repository.deletedAt && token.status === 'active')
}

export function CiTokensPanel() {
  const t = useTranslations('ciTokens')

  // User-level tokens — oversight of every user's self-service CI tokens.
  const [tokens, setTokens] = useState<McpTokenListItem[]>([])
  const [tokensLoaded, setTokensLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  // Legacy (grandfathered, repo-scoped) tokens — revoke/inspect only.
  const [legacyTokens, setLegacyTokens] = useState<AdminLegacyCiTokenListItem[]>([])
  const [legacyLoaded, setLegacyLoaded] = useState(false)
  const [legacyError, setLegacyError] = useState<string | null>(null)
  const [legacyRevokingId, setLegacyRevokingId] = useState<string | null>(null)

  // Shared across both shapes — token ids never collide between the two lists.
  const [setupByTokenId, setSetupByTokenId] = useState<Record<string, McpTokenConfig>>({})
  const [auditByTokenId, setAuditByTokenId] = useState<Record<string, McpTokenAuditEvent[]>>({})
  const [alertsByTokenId, setAlertsByTokenId] = useState<Record<string, McpTokenAlert[]>>({})
  const [expandedSetupId, setExpandedSetupId] = useState<string | null>(null)
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null)
  const [expandedAlertsId, setExpandedAlertsId] = useState<string | null>(null)
  const [activeClientByTokenId, setActiveClientByTokenId] = useState<
    Record<string, McpClientConfigKey>
  >({})

  const loadTokens = useCallback(async () => {
    try {
      const { tokens } = await adminCiTokensApi.list()
      setTokens(tokens)
      setError(null)
    } catch {
      setError('Failed to load CI / automation tokens.')
    } finally {
      setTokensLoaded(true)
    }
  }, [])

  useEffect(() => {
    void loadTokens()
  }, [loadTokens])

  const loadLegacyTokens = useCallback(async () => {
    try {
      const { tokens } = await adminCiTokensApi.listLegacy()
      setLegacyTokens(tokens)
      setLegacyError(null)
    } catch {
      setLegacyError('Failed to load legacy tokens.')
    } finally {
      setLegacyLoaded(true)
    }
  }, [])

  useEffect(() => {
    void loadLegacyTokens()
  }, [loadLegacyTokens])

  function isLegacyTokenId(tokenId: string) {
    return legacyTokens.some((legacyToken) => legacyToken.id === tokenId)
  }

  // Audit/alerts inspection is shared by both tables; a failure must surface in
  // the card its row lives in, or a legacy error renders under the wrong table.
  function setInspectionError(tokenId: string, message: string) {
    if (isLegacyTokenId(tokenId)) setLegacyError(message)
    else setError(message)
  }

  function activeClientFor(tokenId: string) {
    return activeClientByTokenId[tokenId] ?? 'claudeDesktop'
  }

  function setActiveClientFor(tokenId: string, client: McpClientConfigKey) {
    setActiveClientByTokenId((prev) => ({ ...prev, [tokenId]: client }))
  }

  async function copySetupConfig(config: McpTokenConfig, activeClient: McpClientConfigKey) {
    await navigator.clipboard.writeText(configToText(config, activeClient))
  }

  async function revokeToken(tokenId: string) {
    setRevokingId(tokenId)
    setError(null)
    try {
      await adminCiTokensApi.revoke(tokenId)
      await loadTokens()
      setSetupByTokenId((prev) => {
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to revoke the token.')
    } finally {
      setRevokingId(null)
    }
  }

  async function revokeLegacyToken(tokenId: string) {
    setLegacyRevokingId(tokenId)
    setLegacyError(null)
    try {
      await adminCiTokensApi.revokeLegacy(tokenId)
      await loadLegacyTokens()
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
      if (expandedAuditId === tokenId) setExpandedAuditId(null)
      if (expandedAlertsId === tokenId) setExpandedAlertsId(null)
    } catch (err) {
      setLegacyError(err instanceof ApiError ? err.message : 'Failed to revoke the token.')
    } finally {
      setLegacyRevokingId(null)
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
      const data = await adminCiTokensApi.getConfig(tokenId)
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
      const { events } = await adminCiTokensApi.listAudit(tokenId)
      setAuditByTokenId((prev) => ({ ...prev, [tokenId]: events }))
    } catch {
      setInspectionError(tokenId, 'Failed to load the audit trail.')
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
      const { alerts } = await adminCiTokensApi.listAlerts(tokenId)
      setAlertsByTokenId((prev) => ({ ...prev, [tokenId]: alerts }))
    } catch {
      setInspectionError(tokenId, 'Failed to load alerts.')
      setExpandedAlertsId(null)
    }
  }

  async function acknowledgeAlert(tokenId: string, alertId: string) {
    try {
      await adminCiTokensApi.acknowledgeAlert(tokenId, alertId)
      const { alerts } = await adminCiTokensApi.listAlerts(tokenId)
      setAlertsByTokenId((prev) => ({ ...prev, [tokenId]: alerts }))
      if (isLegacyTokenId(tokenId)) await loadLegacyTokens()
      else await loadTokens()
    } catch {
      setInspectionError(tokenId, 'Failed to acknowledge the alert.')
    }
  }

  const anomalyCount = legacyTokens.filter(isAnomalousLegacyToken).length

  return (
    <div className="flex w-full flex-col gap-3.5">
      <section className="overflow-hidden rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white shadow-sm">
        <div className="border-b border-[var(--convergekit-line-2)] px-5 py-4">
          <h3 className="text-sm font-semibold text-[var(--convergekit-ink)]">{t('title')}</h3>
          <p className="mt-0.5 text-[12.5px] text-[var(--convergekit-ink-3)]">
            Oversight of every user&apos;s self-service CI / automation tokens. Revoke any token
            below — creating, renewing, and testing a token stay self-service for its owner.
          </p>
        </div>

        {error && <p className="px-5 pt-3 text-sm text-destructive">{error}</p>}

        <div className="overflow-x-auto pb-1">
          <table className="ci-token-table w-full min-w-[1040px] table-fixed border-separate border-spacing-0 text-left">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[13%]" />
              <col className="w-[15%]" />
              <col className="w-[9%]" />
              <col className="w-[11%]" />
              <col className="w-[10%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-[var(--convergekit-line-2)] text-[11px] uppercase tracking-[0.06em] text-[var(--convergekit-ink-4)] [&>th]:px-5 [&>th]:py-2.5 [&>th]:font-medium">
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
              {!tokensLoaded ? (
                <tr>
                  <td colSpan={7} className="px-5 py-5 text-sm text-[var(--convergekit-ink-3)]">
                    Loading…
                  </td>
                </tr>
              ) : tokens.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-5 text-sm text-[var(--convergekit-ink-3)]">
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
                    <td className="min-w-0 px-5 py-3 align-top text-[12.5px] text-[var(--convergekit-ink-2)]">
                      <span className="block truncate" title={token.owner.email}>
                        {token.owner.name}
                      </span>
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
                      <TokenHealthBadge token={token} result={null} />
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
                        {token.status !== 'revoked' && (
                          <button
                            type="button"
                            onClick={() => void revokeToken(token.id)}
                            disabled={revokingId === token.id}
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

      {/* Legacy tokens — owner + repository, revoke-only, audit/alerts on both shapes, no config */}
      <section className="overflow-hidden rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--convergekit-line-2)] px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--convergekit-ink)]">Legacy tokens</h3>
            <p className="mt-0.5 text-[12.5px] text-[var(--convergekit-ink-3)]">
              Grandfathered repository-scoped tokens created before per-user CI tokens existed.
              Revoke-only — new legacy tokens can no longer be created.
            </p>
          </div>
          {anomalyCount > 0 && (
            <span className="inline-flex items-center whitespace-nowrap rounded-full border border-[var(--convergekit-align-conflict-bd)] bg-[var(--convergekit-align-conflict-bg)] px-2 py-0.5 text-xs font-medium text-[var(--convergekit-align-conflict-fg)]">
              {anomalyCount} active on deleted repo{anomalyCount === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {legacyError && <p className="px-5 pt-3 text-sm text-destructive">{legacyError}</p>}

        <div className="overflow-x-auto pb-1">
          <table className="w-full min-w-[980px] table-fixed border-separate border-spacing-0 text-left">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[11%]" />
              <col className="w-[15%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[8%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-[var(--convergekit-line-2)] text-[11px] uppercase tracking-[0.06em] text-[var(--convergekit-ink-4)] [&>th]:px-5 [&>th]:py-2.5 [&>th]:font-medium">
                <th>Label</th>
                <th>Owner</th>
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
              {!legacyLoaded ? (
                <tr>
                  <td colSpan={7} className="px-5 py-5 text-sm text-[var(--convergekit-ink-3)]">
                    Loading…
                  </td>
                </tr>
              ) : legacyTokens.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-5 text-sm text-[var(--convergekit-ink-3)]">
                    No legacy tokens.
                  </td>
                </tr>
              ) : (
                legacyTokens.map((token) => {
                  const isDeletedRepoAnomaly = isAnomalousLegacyToken(token)
                  return (
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
                        <span className="block truncate" title={token.owner.email}>
                          {token.owner.name}
                        </span>
                      </td>
                      <td className="min-w-0 px-5 py-3 align-top text-[12.5px] text-[var(--convergekit-ink-2)]">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate" title={token.repository.name}>
                            {token.repository.name}
                          </span>
                          {isDeletedRepoAnomaly && (
                            <span
                              className="inline-flex shrink-0 items-center rounded-full border border-[var(--convergekit-align-conflict-bd)] bg-[var(--convergekit-align-conflict-bg)] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--convergekit-align-conflict-fg)] uppercase"
                              aria-label="This repository has been deleted, but the token is still active"
                            >
                              Repo deleted
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-3 align-top text-[12.5px] text-[var(--convergekit-ink-2)] capitalize">
                        {token.status}
                      </td>
                      <td className="px-5 py-3 align-top text-[12.5px] whitespace-nowrap text-[var(--convergekit-ink-3)]">
                        <ClientTime iso={token.lastUsedAt} style="relative" fallback={t('never')} />
                      </td>
                      <td className="px-5 py-3 align-top text-[12.5px] text-[var(--convergekit-ink-3)]">
                        {token.alertCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => void toggleAlerts(token.id)}
                            className="rounded-md px-1.5 py-0.5 text-xs text-[var(--convergekit-align-stale-fg)] transition-colors hover:bg-[var(--convergekit-align-stale-bg)]"
                          >
                            {token.alertCount}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-3 text-right align-top">
                        <div className="ci-token-actions">
                          <button
                            type="button"
                            onClick={() => void toggleAudit(token.id)}
                            className="rounded-md px-2 py-1 text-xs text-[var(--convergekit-ink-3)] transition-colors hover:bg-[var(--convergekit-bg-3)] hover:text-[var(--convergekit-ink)]"
                          >
                            Audit
                          </button>
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
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {legacyTokens.map((token) => (
          <div key={`${token.id}-expansions`} className="px-5">
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
    </div>
  )
}
