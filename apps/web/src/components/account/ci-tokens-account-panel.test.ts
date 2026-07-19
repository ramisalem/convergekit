import { describe, expect, it } from 'vitest'
import { readSource } from '../../test/read-source'

describe('CI tokens account panel', () => {
  it('lists, creates, renews, revokes, and tests via meCiTokensApi (never ciTokensApi/adminCiTokensApi)', () => {
    const source = readSource('src/components/account/ci-tokens-account-panel.tsx')
    expect(source).toContain('meCiTokensApi.list')
    expect(source).toContain('meCiTokensApi.create')
    expect(source).toContain('meCiTokensApi.renew')
    expect(source).toContain('meCiTokensApi.revoke')
    expect(source).toContain('meCiTokensApi.testConnection')
    expect(source).toContain('meCiTokensApi.getConfig')
    expect(source).toContain('meCiTokensApi.listAudit')
    expect(source).toContain('meCiTokensApi.listAlerts')
    expect(source).toContain('meCiTokensApi.listLegacy')
    expect(source).toContain('meCiTokensApi.revokeLegacy')
    expect(source).not.toContain('adminCiTokensApi')
    expect(source).not.toContain('ciTokensApi')
    expect(source).toContain('expiresInDays')
    expect(source).toContain('repo:read')
    expect(source).toContain('docs:search')
    expect(source).toContain('files:read')
    expect(source).toContain('fingerprint')
  })

  it("has no owner column or owner-based gating — every row is already the caller's own token", () => {
    const source = readSource('src/components/account/ci-tokens-account-panel.tsx')
    expect(source).not.toContain('owner')
    expect(source).not.toContain('Owner')
    expect(source).not.toContain('isOwnToken')
  })

  it("gates create/renew on the caller's ciTokensEnabled from the app's current-user hook", () => {
    const source = readSource('src/components/account/ci-tokens-account-panel.tsx')
    expect(source).toContain("import { useUser } from '@/components/user-nav'")
    expect(source).toContain('useUser()')
    expect(source).toContain('const ciTokensEnabled = user?.ciTokensEnabled === true')
    expect(source).toContain('ciTokensEnabled &&')
  })

  it('renders the legacy section whenever legacy rows exist, regardless of the flag, revoke-only', () => {
    const source = readSource('src/components/account/ci-tokens-account-panel.tsx')
    expect(source).toContain('const hasLegacy = legacyTokens.length > 0')
    expect(source).toContain('hasLegacy && (')

    const markerIndex = source.indexOf('Legacy tokens — revoke-only')
    expect(markerIndex).toBeGreaterThan(-1)
    const sectionEnd = source.indexOf('</section>', markerIndex)
    expect(sectionEnd).toBeGreaterThan(-1)
    const legacySection = source.slice(markerIndex, sectionEnd)

    expect(legacySection).toContain('token.repository.name')
    expect(legacySection).toContain('token.alertCount')
    expect(legacySection).toContain('token.fingerprint')
    expect(legacySection).toContain('token.status')
    expect(legacySection).toContain('revokeLegacyToken(')
    expect(legacySection).not.toContain('renewToken(')
    expect(legacySection).not.toContain('testConnection(')
    expect(legacySection).not.toContain('toggleSetup(')
    expect(legacySection).not.toContain('getConfig')
  })

  it('shows the ask-an-admin empty state (no create form) only when the flag is off and there are no legacy rows', () => {
    const source = readSource('src/components/account/ci-tokens-account-panel.tsx')
    // !legacyError: a failed legacy fetch must show the retry card, never the
    // false "not enabled" claim (the grandfathered population depends on this).
    expect(source).toContain('!ciTokensEnabled && !hasLegacy && !legacyError')
    expect(source).toMatch(/aren.t enabled for your account/)
    expect(source).toMatch(/ask an admin/i)
  })

  it('surfaces a legacy-fetch failure outside the hasLegacy gate, with a retry that can succeed', () => {
    const source = readSource('src/components/account/ci-tokens-account-panel.tsx')
    expect(source).toContain('legacyError && !hasLegacy && (')
    expect(source).toMatch(/Couldn.t load your legacy CI \/ automation tokens/)
    // The Retry button itself, not just the initial useEffect call.
    expect(source).toContain('onClick={() => void loadLegacyTokens()}')
    // A successful retry must clear the sticky error, or the card never goes away.
    expect(source).toContain('setLegacyError(null)')
  })

  it('row actions are status-correct: renew only for expired, no revoke on revoked rows', () => {
    const source = readSource('src/components/account/ci-tokens-account-panel.tsx')
    // The server rejects renewing a REVOKED token (only expired renew is valid),
    // and revoking an already-revoked row 404s — neither button may render there.
    // Count-asserted so a partial regression (one of the sites) still fails.
    expect(source.match(/token\.status === 'expired' && \(/g)).toHaveLength(2)
    // Own-token table AND the legacy table both guard their Revoke buttons.
    expect(source.match(/token\.status !== 'revoked' && \(/g)).toHaveLength(2)
  })

  it('shows an ask-an-admin note (not the empty state) when the flag is off but legacy rows exist', () => {
    const source = readSource('src/components/account/ci-tokens-account-panel.tsx')
    expect(source).toContain('!ciTokensEnabled && hasLegacy')
  })

  it('renders audit/alerts expansions via the shared widgets, not inline markup', () => {
    const source = readSource('src/components/account/ci-tokens-account-panel.tsx')
    expect(source).toContain('AuditTrailPanel')
    expect(source).toContain('AlertsPanel')
    // The expansion markup itself lives in mcp-token-widgets — these strings
    // leaving this file is the proof the inline copies are gone.
    expect(source).not.toContain('Audit trail')
    expect(source).not.toContain('Suspicious-use alerts')
  })

  it('is linked from the account nav', () => {
    const source = readSource('src/components/account-nav-links.tsx')
    expect(source).toContain('/account/ci-tokens')
  })
})
