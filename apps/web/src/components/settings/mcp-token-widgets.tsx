'use client'

import { ClientTime } from '@/components/ui/client-time'
import {
  type McpClientConfigKey,
  type McpConnectionTestResult,
  type McpTokenAlert,
  type McpTokenAuditEvent,
  type McpTokenConfig,
  type McpTokenListItem,
} from '@/lib/api-client'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Loader2,
  LockKeyhole,
  Play,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

export type Token = {
  id: string
} & McpTokenListItem

export type NewTokenSetup = McpTokenConfig & { token: string; tokenDetails: McpTokenListItem }

const MCP_CLIENTS: Array<{ key: McpClientConfigKey; label: string }> = [
  { key: 'claudeDesktop', label: 'Claude Desktop' },
  { key: 'cursor', label: 'Cursor' },
  { key: 'generic', label: 'Generic JSON' },
]

export function configToText(config: McpTokenConfig, activeClient: McpClientConfigKey) {
  return JSON.stringify(config.clientConfigs[activeClient].config, null, 2)
}

export function CopyButton({
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
    <button onClick={copy} className={className} title={label} type="button">
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {label !== 'Copy' ? <span>{copied ? 'Copied' : label}</span> : null}
    </button>
  )
}

export function TokenHealthBadge({
  token,
  result,
}: {
  token: Token
  result: McpConnectionTestResult | null
}) {
  const t = useTranslations('ciTokens')
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

export function ConnectionCheck({
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

export function ConnectionResultPanel({ result }: { result: McpConnectionTestResult }) {
  const t = useTranslations('ciTokens')

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

// Audit/alerts expansion rows shared by the account panel (self-service) and the
// admin oversight panel — same markup for both token shapes.

export function AuditTrailPanel({ events }: { events: McpTokenAuditEvent[] }) {
  return (
    <div className="border-t border-[var(--convergekit-line-2)] py-3">
      <div className="rounded-md border border-[var(--convergekit-line)] bg-[var(--convergekit-bg-2)] p-3">
        <p className="text-xs font-medium text-[var(--convergekit-ink)]">Audit trail</p>
        {events.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--convergekit-ink-3)]">No audit events yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {events.map((event) => (
              <li key={event.id} className="text-xs text-[var(--convergekit-ink-3)]">
                <span className="font-medium text-[var(--convergekit-ink)]">{event.status}</span> ·{' '}
                {event.method}
                {event.toolName ? ` / ${event.toolName}` : ''} · {event.latencyMs} ms ·{' '}
                {event.ipAddress ?? 'unknown IP'} ·{' '}
                <ClientTime iso={event.createdAt} style="dateTime" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function AlertsPanel({
  alerts,
  onAcknowledge,
}: {
  alerts: McpTokenAlert[]
  onAcknowledge: (alertId: string) => void
}) {
  return (
    <div className="border-t border-[var(--convergekit-line-2)] py-3">
      <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3">
        <p className="text-xs font-medium text-amber-900">Suspicious-use alerts</p>
        {alerts.length === 0 ? (
          <p className="mt-2 text-xs text-amber-800">No open alerts.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {alerts.map((alert) => (
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
                  onClick={() => onAcknowledge(alert.id)}
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
  )
}

export interface McpSetupPanelProps {
  config: McpTokenConfig
  activeClient: McpClientConfigKey
  onActiveClientChange: (client: McpClientConfigKey) => void
  onCopyConfig: () => void
  rawToken?: string
}

export function McpSetupPanel({
  config,
  activeClient,
  onActiveClientChange,
  onCopyConfig,
  rawToken,
}: McpSetupPanelProps) {
  const t = useTranslations('ciTokens')
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

export interface NewTokenBannerProps {
  setup: NewTokenSetup
  activeClient: McpClientConfigKey
  onActiveClientChange: (client: McpClientConfigKey) => void
  onCopyConfig: () => void
  testResult: McpConnectionTestResult | null
  testing: boolean
  onTest: () => void
  onDismiss: () => void
}
export function NewTokenBanner({
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
      {testResult && (
        <div className="px-5 pb-4">
          <ConnectionResultPanel result={testResult} />
        </div>
      )}
    </div>
  )
}
