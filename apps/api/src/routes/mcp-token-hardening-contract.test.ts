import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..')

function read(path: string) {
  return readFileSync(join(root, path), 'utf8')
}

describe('MCP token hardening implementation contract', () => {
  it('ships the persistence model for expiry, scopes, revocation, audit, alerts, and user deactivation', () => {
    const schema = read('packages/db/src/schema.ts')
    const migrationPath = join(root, 'packages/db/migrations/0015_mcp_token_hardening.sql')

    expect(existsSync(migrationPath)).toBe(true)
    expect(schema).toContain('fingerprint')
    expect(schema).toContain('scopes')
    expect(schema).toContain('expiresAt')
    expect(schema).toContain('revokedAt')
    expect(schema).toContain('mcpTokenAuditEvents')
    expect(schema).toContain('mcpTokenAlerts')
    expect(schema).toContain('deactivatedAt')

    const migration = read('packages/db/migrations/0015_mcp_token_hardening.sql')
    expect(migration).toContain('force_rotate_static_token_rollout')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "mcp_token_audit_events"')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "mcp_token_alerts"')
  })

  it('wires the manual hardening migration into the database migration command', () => {
    const packageJson = read('packages/db/package.json')
    const manualMigrationRunner = read('packages/db/src/apply-manual-migrations.ts')

    expect(packageJson).toContain('apply-manual-migrations')
    expect(manualMigrationRunner).toContain('0015_mcp_token_hardening.sql')
    expect(manualMigrationRunner).toContain('manual_migrations')
  })

  it('adds repository token renewal, audit, alert, and soft revoke routes', () => {
    const routes = read('apps/api/src/routes/repositories.ts')

    expect(routes).toContain("repositoryRoutes.post('/:id/mcp-tokens/:tokenId/renew'")
    expect(routes).toContain("repositoryRoutes.get('/:id/mcp-tokens/:tokenId/audit'")
    expect(routes).toContain("repositoryRoutes.get('/:id/mcp-tokens/:tokenId/alerts'")
    expect(routes).toContain(
      "repositoryRoutes.post('/:id/mcp-tokens/:tokenId/alerts/:alertId/acknowledge'",
    )
    expect(routes).toContain('revokedAt: new Date()')
    expect(routes).toContain('expiresInDays')
    expect(routes).toContain('scopes')
  })

  it('does not create temporary connection-test tokens for inactive tokens', () => {
    const routes = read('apps/api/src/routes/repositories.ts')

    expect(routes).toContain('getMcpConnectionTestBlockReason')
    expect(routes.indexOf('getMcpConnectionTestBlockReason')).toBeLessThan(
      routes.indexOf('createMcpTokenSecret()'),
    )
  })

  it('lets repository admins list and filter MCP tokens by owner while users stay scoped to their own tokens', () => {
    const routes = read('apps/api/src/routes/repositories.ts')

    expect(routes).toContain('mcpTokenOwnerFilterSchema')
    expect(routes).toContain('selectedOwnerUserId')
    expect(routes).toContain('ownerOptions')
    expect(routes).toContain('owner: {')
    expect(routes).toContain('isRepositoryAdmin')
    expect(routes).toContain('isRepositoryAdmin ?')
    expect(routes).toContain('eq(mcpTokens.userId, selectedOwnerUserId)')
    expect(routes).toContain('eq(mcpTokens.userId, userId)')
  })

  it('enforces runtime token health, access, scopes, rate limits, and audit metadata', () => {
    const middleware = read('apps/api/src/middleware/require-mcp-token.ts')
    const mcpRoute = read('apps/api/src/routes/mcp.ts')
    const mcpServer = read('packages/mcp/src/server.ts')
    const rateLimit = read('apps/api/src/lib/rate-limit.ts')

    expect(middleware).toContain('revokedAt')
    expect(middleware).toContain('expiresAt')
    expect(middleware).toContain('deactivatedAt')
    expect(middleware).toContain('checkRateLimit')
    expect(middleware).toContain('mcpToken')
    expect(mcpRoute).toContain('recordMcpAuditEvent')
    expect(mcpRoute).toContain('mcpToolsForScopes')
    expect(mcpServer).toContain('enabledTools')
    expect(rateLimit).toContain("'mcp-token'")
    expect(rateLimit).toContain("'mcp-user'")
    expect(rateLimit).toContain("'mcp-repo'")
  })

  it('adds admin revoke-all and user deactivation controls', () => {
    const usersRoute = read('apps/api/src/routes/users.ts')
    const apiClient = read('apps/web/src/lib/api-client.ts')
    const usersPanel = read('apps/web/src/components/settings/users-panel.tsx')

    expect(usersRoute).toContain("userManagementRoutes.post('/:id/mcp-tokens/revoke-all'")
    expect(usersRoute).toContain("userManagementRoutes.post('/:id/deactivate'")
    expect(usersRoute).toContain("userManagementRoutes.post('/:id/reactivate'")
    expect(apiClient).toContain('revokeAllMcpTokens')
    expect(apiClient).toContain('deactivate')
    expect(apiClient).toContain('reactivate')
    expect(usersPanel).toContain('Revoke MCP tokens')
    expect(usersPanel).toContain('Deactivate')
    expect(usersPanel).toContain('Reactivate')
  })

  it('surfaces expiry, scopes, fingerprint, renew, audit, and alerts in repository settings', () => {
    const settingsTab = read('apps/web/src/components/repository-detail/settings-tab.tsx')

    expect(settingsTab).toContain('expiresInDays')
    expect(settingsTab).toContain('repo:read')
    expect(settingsTab).toContain('docs:search')
    expect(settingsTab).toContain('files:read')
    expect(settingsTab).toContain('fingerprint')
    expect(settingsTab).toContain('renewMcpToken')
    expect(settingsTab).toContain('listMcpTokenAudit')
    expect(settingsTab).toContain('listMcpTokenAlerts')
  })
})
