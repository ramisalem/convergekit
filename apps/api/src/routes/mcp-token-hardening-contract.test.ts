import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { mustIndexOf, mustSlice } from '../test/source-pins.js'

// This is the ONE contract file that greps ACROSS packages (api + web + db) to
// pin the end-state, per-user-capability CI-token model as a single
// cross-cutting story: a nullable-repository token that acts user-level, gated
// by `user.ci_tokens_enabled` rather than admin role, with self-service
// creation split from admin oversight. Per-router detail (exhaustive
// serialization shapes, every endpoint's verb/path, etc.) belongs in each
// router's own contract test — this file only pins the invariants that matter
// BECAUSE they span files, so a change in one place that breaks the story
// elsewhere fails here even if every per-file suite stays green.

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..')

function read(path: string) {
  return readFileSync(join(root, path), 'utf8')
}

describe('migrations (0023 -> 0024) + persistence model', () => {
  it('0023 exists and only drops NOT NULL on both repository_id columns — no hard-revoke, no marker', () => {
    const migrationPath = join(root, 'packages/db/migrations/0023_admin_ci_tokens.sql')
    expect(existsSync(migrationPath)).toBe(true)

    const migration = read('packages/db/migrations/0023_admin_ci_tokens.sql')
    expect(migration).toContain(
      'ALTER TABLE "mcp_tokens" ALTER COLUMN "repository_id" DROP NOT NULL',
    )
    expect(migration).toContain(
      'ALTER TABLE "mcp_token_alerts" ALTER COLUMN "repository_id" DROP NOT NULL',
    )
    expect(migration).not.toContain('admin_token_migration')
    expect(migration).not.toMatch(/UPDATE\s+"mcp_tokens"\s+SET\s+"revoked_at"/i)
  })

  it('0024 exists, un-revokes whatever the original 0023 killed, and adds the capability column', () => {
    const migrationPath = join(root, 'packages/db/migrations/0024_ci_token_capability.sql')
    expect(existsSync(migrationPath)).toBe(true)

    const migration = read('packages/db/migrations/0024_ci_token_capability.sql')
    expect(migration).toContain('"revoked_reason" = \'admin_token_migration\'')
    expect(migration).toContain('SET "revoked_at" = NULL')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "ci_tokens_enabled"')
    expect(migration).toContain('boolean NOT NULL DEFAULT false')
  })

  it('0024 issues exactly one UPDATE, and it targets mcp_tokens, never "user"', () => {
    const migration = read('packages/db/migrations/0024_ci_token_capability.sql')
    const updateStatements = migration.match(/UPDATE\s+"[a-z_]+"/gi) ?? []
    expect(updateStatements).toHaveLength(1)
    expect(updateStatements[0]).toBe('UPDATE "mcp_tokens"')
  })

  it('runs 0022 -> 0023 -> 0024 in order', () => {
    const runner = read('packages/db/src/apply-manual-migrations.ts')
    const i22 = mustIndexOf(runner, "'0022_mcp_audit_oauth.sql'")
    const i23 = mustIndexOf(runner, "'0023_admin_ci_tokens.sql'")
    const i24 = mustIndexOf(runner, "'0024_ci_token_capability.sql'")
    expect(i22).toBeLessThan(i23)
    expect(i23).toBeLessThan(i24)
  })

  it('ships the rest of the persistence model: audit events, alerts, deactivation, and the capability flag', () => {
    const schema = read('packages/db/src/schema.ts')
    expect(schema).toContain('mcpTokenAuditEvents')
    expect(schema).toContain('mcpTokenAlerts')
    expect(schema).toContain('deactivatedAt')
    expect(schema).toContain('ciTokensEnabled')
  })
})

describe('middleware dual-path (require-mcp-token.ts + require-mcp-credential.ts)', () => {
  it('branches on repositoryId === null: user-level capability gate vs grandfathered repo access', () => {
    const middleware = read('apps/api/src/middleware/require-mcp-token.ts')
    expect(middleware).toContain('repositoryId === null')
    expect(middleware).toContain('userCiEnabled !== true')
    expect(middleware).toContain('scopedRepositoryIds')
    expect(middleware).toContain('leftJoin(repositories')
  })

  it('never reintroduces the old admin-only gate', () => {
    const middleware = read('apps/api/src/middleware/require-mcp-token.ts')
    expect(middleware).not.toContain("userRole !== 'admin'")
  })

  it('still enforces revocation, expiry, deactivation, and rate limits ahead of the dual-path branch', () => {
    const middleware = read('apps/api/src/middleware/require-mcp-token.ts')
    const rateLimit = read('apps/api/src/lib/rate-limit.ts')
    expect(middleware).toContain('revokedAt')
    expect(middleware).toContain('expiresAt')
    expect(middleware).toContain('deactivatedAt')
    expect(middleware).toContain('checkRateLimit')
    expect(rateLimit).toContain("'mcp-token'")
    expect(rateLimit).toContain("'mcp-user'")
  })

  it('normalizes the discovery-safe static principal with its own mcpTokenId', () => {
    const credential = read('apps/api/src/middleware/require-mcp-credential.ts')
    expect(credential).toContain('mcpTokenId: staticToken.id')
  })
})

describe('serving dual-path (mcp.ts)', () => {
  it('serves both a user-scoped server and a repo-implied server off the same static principal', () => {
    const mcpRoute = read('apps/api/src/routes/mcp.ts')
    expect(mcpRoute).toContain('createUserScopedMcpServer(')
    expect(mcpRoute).toContain('createMcpServer(')
  })

  it('polarity: repositoryId === null resolves to the user-scoped server before the repo-implied server is ever reached', () => {
    const mcpRoute = read('apps/api/src/routes/mcp.ts')
    const nullCheckIndex = mustIndexOf(mcpRoute, 'principal.repositoryId === null')
    const userScopedCallIndex = mustIndexOf(
      mcpRoute,
      'createUserScopedMcpServer(buildUserServerDeps(principal.userId), { enabledTools })',
    )
    const repoServerCallIndex = mustIndexOf(
      mcpRoute,
      'createMcpServer(principal.repositoryId, { embeddingOptions, enabledTools })',
    )
    expect(nullCheckIndex).toBeLessThan(userScopedCallIndex)
    expect(userScopedCallIndex).toBeLessThan(repoServerCallIndex)
  })

  it('keys the static session by token id, scopes tools, and audits every call', () => {
    const mcpRoute = read('apps/api/src/routes/mcp.ts')
    expect(mcpRoute).toContain('`static:${principal.mcpTokenId}`')
    expect(mcpRoute).toContain('mcpToolsForScopes')
    expect(mcpRoute).toContain('recordMcpAuditEvent')
  })

  it('the user-scoped server gates its tool set by enabledTools', () => {
    const userServer = read('packages/mcp/src/user-server.ts')
    expect(userServer).toContain('enabledTools')
  })
})

describe('revocation (mcp-token-security.ts)', () => {
  it("shouldRevokeMcpTokenRow keys off the owner's CI capability flag, not admin status", () => {
    const security = read('apps/api/src/lib/mcp-token-security.ts')
    expect(security).toContain('shouldRevokeMcpTokenRow')
    expect(security).toContain('ownerCiEnabled')
    expect(security).not.toContain('ownerIsAdmin')
  })
})

describe('self-service (me-ci-tokens.ts + ci-token-service.ts)', () => {
  it('the row-locked create/renew live in the service — the hookable seam the integration suite calls directly', () => {
    const service = read('apps/api/src/lib/ci-token-service.ts')
    expect(service).toContain('export async function createUserLevelToken')
    expect(service).toContain('export async function renewUserLevelToken')
    expect(service).toContain(".for('update')")
    expect(service).toContain('hooks?.afterLock')
    expect(service).toContain('hooks?.beforeCommit')
  })

  it('the router is a thin caller: opens a transaction and delegates, no inline lock, no any-shape lookup', () => {
    const meRouter = read('apps/api/src/routes/me-ci-tokens.ts')
    expect(meRouter).toContain('createUserLevelToken(tx')
    expect(meRouter).toContain('renewUserLevelToken(tx')
    expect(meRouter).not.toContain(".for('update')")
    expect(meRouter).not.toContain('assertAnyCiToken')
  })
})

describe('oversight (ci-tokens.ts)', () => {
  it('mounts at /admin/ci-tokens, behind the blanket admin gate', () => {
    const appSource = read('apps/api/src/app.ts')
    expect(appSource).toContain("app.use('/admin/*', requireAuth, requireAdmin)")
    expect(appSource).toContain("app.route('/admin/ci-tokens', ciTokenRoutes)")
  })

  it('mints nothing here — creation lives only in ci-token-service, shared with self-service', () => {
    const ciRoutes = read('apps/api/src/routes/ci-tokens.ts')
    const ciTokenService = read('apps/api/src/lib/ci-token-service.ts')
    // Count-pinned: the ONLY POST on the oversight router is alert-acknowledge.
    // A bare not-root-POST pin would let a future post('/mint') slip past.
    const postRoutes = ciRoutes.match(/ciTokenRoutes\.post\(/g) ?? []
    expect(postRoutes).toHaveLength(1)
    expect(ciRoutes).toContain("ciTokenRoutes.post('/:tokenId/alerts/:alertId/acknowledge'")
    expect(ciTokenService).toContain('repositoryId: null')
  })

  it('splits user-level (repository_id IS NULL) from legacy repo-scoped (IS NOT NULL) listing and revoke', () => {
    const ciRoutes = read('apps/api/src/routes/ci-tokens.ts')
    expect(ciRoutes).toContain("ciTokenRoutes.get('/legacy'")
    expect(ciRoutes).toContain("ciTokenRoutes.delete('/legacy/:tokenId'")
    expect(ciRoutes).toContain('isNotNull(mcpTokens.repositoryId)')
  })

  it('serves config only through assertCiToken (user-level shape only)', () => {
    const ciRoutes = read('apps/api/src/routes/ci-tokens.ts')
    const configBlock = mustSlice(
      ciRoutes,
      "ciTokenRoutes.get('/:tokenId/config'",
      "ciTokenRoutes.get('/:tokenId/audit'",
    )
    expect(configBlock).toContain('assertCiToken(')
    expect(configBlock).not.toContain('assertAnyCiToken(')
  })

  it('serves audit, alerts, and acknowledge through assertAnyCiToken (either shape)', () => {
    const ciRoutes = read('apps/api/src/routes/ci-tokens.ts')
    const oversightBlock = mustSlice(
      ciRoutes,
      "ciTokenRoutes.get('/:tokenId/audit'",
      "ciTokenRoutes.delete('/:tokenId'",
    )
    expect(oversightBlock).toContain('assertAnyCiToken(')
    expect(oversightBlock).not.toContain('assertCiToken(')
  })

  it('the revoke-any WHERE is shape-pinned to user-level rows, even past the legacy shape-redirect branch', () => {
    const ciRoutes = read('apps/api/src/routes/ci-tokens.ts')
    const deleteBlock = mustSlice(ciRoutes, "ciTokenRoutes.delete('/:tokenId'")
    expect(deleteBlock).toContain('isNull(mcpTokens.repositoryId)')
  })

  it('repositories.ts hosts no CI-token surface — it lives in ci-tokens.ts and me-ci-tokens.ts now', () => {
    const repoRoutes = read('apps/api/src/routes/repositories.ts')
    expect(repoRoutes).not.toContain("mcp-tokens'")
  })
})

describe('users (users.ts + user-mutations.ts)', () => {
  it('accepts ciTokensEnabled on both the single-user and bulk update schemas', () => {
    const usersRoute = read('apps/api/src/routes/users.ts')
    const updateSchemaBlock = mustSlice(
      usersRoute,
      'const updateUserSchema',
      'const bulkUpdateSchema',
    )
    const bulkSchemaBlock = mustSlice(
      usersRoute,
      'const bulkUpdateSchema',
      'function assertUserEmailAllowed',
    )
    expect(updateSchemaBlock).toContain('ciTokensEnabled: z.boolean().optional()')
    expect(bulkSchemaBlock).toContain('ciTokensEnabled: z.boolean().optional()')
  })

  it('routes stay thin: delegate to the extracted, hookable mutations — no inline row lock', () => {
    const usersRoute = read('apps/api/src/routes/users.ts')
    expect(usersRoute).toContain('disableCapability(tx')
    expect(usersRoute).toContain('deactivateUsers(tx')
    expect(usersRoute).toContain('revokeAllForUser(tx')
    expect(usersRoute).not.toContain(".for('update')")
  })

  it('lockUsers is exported and wired into the bulk route (first-position ordering pinned in users-access-policy.test.ts)', () => {
    const usersRoute = read('apps/api/src/routes/users.ts')
    const mutations = read('apps/api/src/lib/user-mutations.ts')
    expect(mutations).toContain('export function lockUsers')
    expect(usersRoute).toContain('lockUsers(tx, body.userIds)')
  })

  it('pins each mutation to its own revoke reason', () => {
    const mutations = read('apps/api/src/lib/user-mutations.ts')
    expect(mutations).toContain("'ci_tokens_disabled'")
    expect(mutations).toContain("'user_deactivated'")
    expect(mutations).toContain("'admin_user_revoke_all'")
  })

  it('keeps the admin revoke-all + deactivate/reactivate controls wired end-to-end (route, client, panel)', () => {
    const usersRoute = read('apps/api/src/routes/users.ts')
    const apiClient = read('apps/web/src/lib/api-client.ts')
    const usersPanel = read('apps/web/src/components/settings/users-panel.tsx')

    expect(usersRoute).toContain("userManagementRoutes.post('/:id/mcp-tokens/revoke-all'")
    expect(usersRoute).toContain("userManagementRoutes.post('/:id/deactivate'")
    expect(usersRoute).toContain("userManagementRoutes.post('/:id/reactivate'")
    expect(apiClient).toContain('revokeAllMcpTokens')
    // Full method signatures — bare 'deactivate' is satisfied by the deactivatedAt
    // type field even with the method deleted (tautology caught in review).
    expect(apiClient).toContain('deactivate(id: string)')
    expect(apiClient).toContain('reactivate(id: string)')
    expect(usersPanel).toContain('Revoke MCP tokens')
    // Handler wiring, not display copy — the 'Deactivated' status badge would
    // satisfy a bare 'Deactivate' string with both action buttons gone.
    expect(usersPanel).toContain('onDeactivate')
    expect(usersPanel).toContain('onReactivate')
  })
})

describe('web surface split (self-service create vs oversight-only)', () => {
  it('the account panel is the self-service creation surface: expiry + scope picker + renew, flag-gated', () => {
    const accountPanel = read('apps/web/src/components/account/ci-tokens-account-panel.tsx')
    expect(accountPanel).toContain('expiresInDays')
    expect(accountPanel).toContain('repo:read')
    expect(accountPanel).toContain('docs:search')
    expect(accountPanel).toContain('files:read')
    expect(accountPanel).toContain('meCiTokensApi.renew')
    // The POSITIVE creation gate — a bare 'ciTokensEnabled &&' is a substring of
    // the negated '!ciTokensEnabled &&' states and would survive gate removal.
    expect(accountPanel).toContain('ready && ciTokensEnabled && (')
  })

  it('legacy tokens stay visible on the account panel regardless of the capability flag', () => {
    const accountPanel = read('apps/web/src/components/account/ci-tokens-account-panel.tsx')
    expect(accountPanel).toContain('hasLegacy')
  })

  it('the oversight panel has no creation surface — checked case-safely so a future adminCiTokensApi.renew cannot slip past', () => {
    const oversightPanel = read('apps/web/src/components/settings/ci-tokens-panel.tsx')
    // NOT `not.toContain('ciTokensApi.renew')`: the client is namespaced
    // (adminCiTokensApi / meCiTokensApi) and never exposes a bare `ciTokensApi`,
    // so that substring is absent today for the wrong reason — it would stay
    // absent even if a `renew` method were added to adminCiTokensApi tomorrow.
    // `.renew(` and the bare client name are the pins that would actually catch it.
    expect(oversightPanel).not.toContain('.renew(')
    expect(oversightPanel).not.toContain('meCiTokensApi')
    expect(oversightPanel).not.toContain('expiresInDays')
  })

  it('the deprecated ciTokensApi shim is gone from the client — only the split me/admin clients remain', () => {
    const apiClient = read('apps/web/src/lib/api-client.ts')
    expect(apiClient).not.toContain('export const ciTokensApi')
    expect(apiClient).toContain('export const meCiTokensApi')
    expect(apiClient).toContain('export const adminCiTokensApi')
  })

  it('repository settings no longer hosts a token tab', () => {
    const settingsTab = read('apps/web/src/components/repository-detail/settings-tab.tsx')
    expect(settingsTab).not.toContain('mcp-tokens')
  })
})

describe('backfill (packages/db/src/backfill-ci-token-capability.ts)', () => {
  it('takes the table-level EXCLUSIVE lock before any cohort read or grant write', () => {
    const backfill = read('packages/db/src/backfill-ci-token-capability.ts')
    expect(backfill).toContain('LOCK TABLE "user" IN EXCLUSIVE MODE')
  })

  it('marks itself with a filename distinct from the real 0024 schema migration', () => {
    const backfill = read('packages/db/src/backfill-ci-token-capability.ts')
    expect(backfill).toContain("'0024_ci_token_capability_backfill'")
  })

  it('qualifies every cohort predicate column by table alias', () => {
    const backfill = read('packages/db/src/backfill-ci-token-capability.ts')
    expect(backfill).toContain('u.deactivated_at IS NULL')
    expect(backfill).toContain('t.repository_id IS NOT NULL')
  })

  it('only runs main() under direct execution, and aborts by throwing on a count mismatch', () => {
    const backfill = read('packages/db/src/backfill-ci-token-capability.ts')
    expect(backfill).toContain('pathToFileURL')
    expect(backfill).toContain('BackfillCountMismatchError')
  })
})
