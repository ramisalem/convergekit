import { describe, expect, it } from 'vitest'
import { readSource } from '../../test/read-source'

describe('CI tokens oversight panel', () => {
  it('uses adminCiTokensApi exclusively — never meCiTokensApi, never the deleted ciTokensApi shim', () => {
    const source = readSource('src/components/settings/ci-tokens-panel.tsx')
    // Oversight rows must stay identifiable by fingerprint (carried from the v1 pin).
    expect(source).toContain('fingerprint')
    expect(source).toContain('adminCiTokensApi.list(')
    expect(source).toContain('adminCiTokensApi.listLegacy(')
    expect(source).toContain('adminCiTokensApi.revoke(tokenId)')
    expect(source).toContain('adminCiTokensApi.revokeLegacy(tokenId)')
    expect(source).toContain('adminCiTokensApi.getConfig(tokenId)')
    expect(source).toContain('adminCiTokensApi.listAudit(tokenId)')
    expect(source).toContain('adminCiTokensApi.listAlerts(tokenId)')
    expect(source).toContain('adminCiTokensApi.acknowledgeAlert(tokenId, alertId)')
    expect(source).not.toContain('meCiTokensApi')
    // Safe against false positives: "adminCiTokensApi" never contains the lowercase
    // substring "ciTokensApi" (it reads "...admin" + "CiTokensApi", capital C).
    expect(source).not.toContain('ciTokensApi')
  })

  it('has no create form, renew, or testConnection paths — oversight is revoke/inspect only', () => {
    const source = readSource('src/components/settings/ci-tokens-panel.tsx')
    expect(source).not.toContain('showCreateForm')
    expect(source).not.toContain('renewToken')
    expect(source).not.toContain('.renew(')
    expect(source).not.toContain('.create(')
    expect(source).not.toContain('.testConnection(')
    expect(source).not.toContain('testConnection')
    expect(source).not.toContain('NewTokenBanner')
    expect(source).not.toContain('ConnectionResultPanel')
    expect(source).not.toContain('expiresInDays')
  })

  it('drops the per-owner view gating from the old panel — oversight has no notion of "own" token', () => {
    const source = readSource('src/components/settings/ci-tokens-panel.tsx')
    expect(source).not.toContain('isOwnToken')
    expect(source).not.toContain('currentUserId')
    expect(source).toContain('export function CiTokensPanel()')
  })

  it('keeps the shared table/widget idiom from mcp-token-widgets', () => {
    const source = readSource('src/components/settings/ci-tokens-panel.tsx')
    expect(source).toContain("from './mcp-token-widgets'")
    expect(source).toContain('TokenHealthBadge')
    expect(source).toContain('McpSetupPanel')
    expect(source).toContain('configToText')
    // Audit/alerts expansions come from the shared widgets file too — consumed,
    // not defined locally (the account panel renders the same components).
    expect(source).toContain('AuditTrailPanel')
    expect(source).toContain('AlertsPanel')
    expect(source).not.toContain('function AuditTrailPanel')
    expect(source).not.toContain('function AlertsPanel')
  })

  it('routes legacy-row inspection failures (audit/alerts/ack) to the legacy error card', () => {
    const source = readSource('src/components/settings/ci-tokens-panel.tsx')
    // Shape check decides which error banner owns the failure, so a legacy-row
    // failure is never rendered under the user-level table (and vice versa).
    expect(source).toContain('legacyTokens.some((legacyToken) => legacyToken.id === tokenId)')
    expect(source).toContain('setLegacyError(message)')
    expect(source.match(/setInspectionError\(tokenId,/g)).toHaveLength(3)
  })

  it('shows owner name and email on every user-level row (both are used, once per table)', () => {
    const source = readSource('src/components/settings/ci-tokens-panel.tsx')
    expect(source.match(/token\.owner\.name/g)).toHaveLength(2)
    expect(source.match(/token\.owner\.email/g)).toHaveLength(2)
  })

  it('revokes on both shapes via the correct admin endpoint per shape', () => {
    const source = readSource('src/components/settings/ci-tokens-panel.tsx')
    expect(source).toContain('void revokeToken(token.id)')
    expect(source).toContain('void revokeLegacyToken(token.id)')
  })

  it('makes audit, alerts, and acknowledge available on both shapes (count-asserted: one call site per table)', () => {
    const source = readSource('src/components/settings/ci-tokens-panel.tsx')
    expect(source.match(/void toggleAudit\(token\.id\)/g)).toHaveLength(2)
    expect(source.match(/void toggleAlerts\(token\.id\)/g)).toHaveLength(2)
    expect(source.match(/void acknowledgeAlert\(token\.id,/g)).toHaveLength(2)
  })

  it('gates revoke on status (no revoke button on already-revoked rows), count-asserted across both tables', () => {
    const source = readSource('src/components/settings/ci-tokens-panel.tsx')
    expect(source.match(/token\.status !== 'revoked' && \(/g)).toHaveLength(2)
  })

  it('surfaces ApiError.message on revoke failures instead of swallowing into a generic string', () => {
    const source = readSource('src/components/settings/ci-tokens-panel.tsx')
    expect(source).toContain('ApiError')
    expect(
      source.match(/err instanceof ApiError \? err\.message : 'Failed to revoke the token\.'/g),
    ).toHaveLength(2)
  })

  it('legacy section: owner + repository.name, revoke-only besides audit/alerts, no config/setup', () => {
    const source = readSource('src/components/settings/ci-tokens-panel.tsx')
    const markerIndex = source.indexOf('Legacy tokens — owner + repository')
    expect(markerIndex).toBeGreaterThan(-1)
    const sectionEnd = source.indexOf('</section>', markerIndex)
    expect(sectionEnd).toBeGreaterThan(-1)
    const legacySection = source.slice(markerIndex, sectionEnd)

    expect(legacySection).toContain('token.owner.name')
    expect(legacySection).toContain('token.owner.email')
    expect(legacySection).toContain('token.repository.name')
    expect(legacySection).toContain('revokeLegacyToken(')
    expect(legacySection).toContain('toggleAudit(')
    expect(legacySection).toContain('toggleAlerts(')
    expect(legacySection).toContain('acknowledgeAlert(')
    expect(legacySection).not.toContain('toggleSetup(')
    expect(legacySection).not.toContain('McpSetupPanel')
    expect(legacySection).not.toContain('getConfig')
  })

  it('flags the crash-window anomaly: an active legacy token on a soft-deleted repository', () => {
    const source = readSource('src/components/settings/ci-tokens-panel.tsx')
    expect(source).toContain("token.repository.deletedAt && token.status === 'active'")
    expect(source).toContain('Repo deleted')
    // Badge styling uses the app's conflict tokens, not raw red utilities.
    expect(source).not.toContain('border-red-200')
    expect(source).not.toContain('text-red-700')
    // Header chip surfaces mid-list anomalies at a glance.
    expect(source).toContain('anomalyCount > 0')
    expect(source).toContain('active on deleted repo')
    // The explanation is assistive text, not a hover-only tooltip.
    expect(source).toContain(
      'aria-label="This repository has been deleted, but the token is still active"',
    )
    expect(source).not.toContain('title="This repository has been deleted')
  })

  it('is wired as a settings tab with an oversight-focused label, no currentUserId prop', () => {
    const tabs = readSource('src/components/settings/settings-tabs.tsx')
    expect(tabs).toContain("'ci-tokens'")
    expect(tabs).toMatch(/<CiTokensPanel\s*\/>/)
    expect(tabs).toContain('CI token oversight')
    expect(tabs).not.toContain('CiTokensPanel currentUserId')
  })
})
