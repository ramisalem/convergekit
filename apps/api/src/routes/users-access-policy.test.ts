import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mustIndexOf, mustSlice } from '../test/source-pins.js'

describe('user management access policy contracts', () => {
  it('validates admin-created user email against the configured access policy before insert', () => {
    const source = readFileSync(join(process.cwd(), 'src/routes/users.ts'), 'utf8')

    expect(source).toContain('@convergekit/config/access-policy')
    expect(source).toContain('normalizeAccessPolicyEmail')
    expect(source).toContain('assertAllowedAccessPolicyEmail(email)')
    expect(source.indexOf('assertUserEmailAllowed(body.email)')).toBeLessThan(
      source.indexOf('.insert(user)'),
    )
  })

  it('blocks invite resend and reset for legacy users outside the configured email domain', () => {
    const source = readFileSync(join(process.cwd(), 'src/routes/users.ts'), 'utf8')

    expect(source).toContain('assertTargetUserAllowed')
    expect(source).toContain("userManagementRoutes.post('/:id/resend-invite'")
    expect(source).toContain("userManagementRoutes.post('/:id/reset-password'")
    expect(source).toContain('await assertTargetUserAllowed(id)')
  })

  it('revokes OAuth grants when an admin deactivates a user', () => {
    const usersSource = readFileSync(join(process.cwd(), 'src/routes/users.ts'), 'utf8')
    const mutationsSource = readFileSync(join(process.cwd(), 'src/lib/user-mutations.ts'), 'utf8')

    // The revoke itself now lives in the atomic deactivateUsers transaction body
    // (user-mutations.ts) — the route only opens the tx, delegates, and emits the
    // post-commit side effects (sessions + the OAuth event).
    expect(mutationsSource).toContain('revokeGrantsForUser')
    expect(mutationsSource).toContain("revokeGrantsForUser(id, 'user_deactivated', executor)")
    expect(usersSource).toContain('deactivateUsers(tx')
    expect(usersSource).toContain("emitMcpOAuthEvent('token_revoked'")
  })

  it('treats invite tokens for legacy invalid-domain users as invalid', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/invites.ts'), 'utf8')

    expect(source).toContain('@convergekit/config/access-policy')
    expect(source).toContain('isAllowedAccessPolicyEmail(row.email)')
    expect(source).toContain('return null')
    expect(source).toContain('return false')
  })

  it('updateUserSchema and bulkUpdateSchema both accept an optional ciTokensEnabled boolean', () => {
    const source = readFileSync(join(process.cwd(), 'src/routes/users.ts'), 'utf8')

    const updateSchemaBlock = mustSlice(source, 'const updateUserSchema', 'const bulkUpdateSchema')
    const bulkSchemaBlock = mustSlice(
      source,
      'const bulkUpdateSchema',
      'function assertUserEmailAllowed',
    )

    expect(updateSchemaBlock).toContain('ciTokensEnabled: z.boolean().optional()')
    expect(bulkSchemaBlock).toContain('ciTokensEnabled: z.boolean().optional()')
  })

  it('list and single-user projections surface ciTokensEnabled to the admin UI', () => {
    const source = readFileSync(join(process.cwd(), 'src/routes/users.ts'), 'utf8')

    const listHandler = mustSlice(
      source,
      "userManagementRoutes.get('/', async (c) => {",
      "userManagementRoutes.post('/', async (c) => {",
    )
    expect(listHandler).toContain('ciTokensEnabled: user.ciTokensEnabled')

    const getHandler = mustSlice(
      source,
      "userManagementRoutes.get('/:id'",
      "userManagementRoutes.put('/:id'",
    )
    // No explicit `columns` restriction on the relational query — Drizzle
    // returns every user column by default, so ciTokensEnabled already flows
    // through this shape without any projection change here.
    expect(getHandler).toContain('db.query.user.findFirst({ where: eq(user.id, id) })')
    expect(getHandler).not.toContain('columns:')
  })

  it('extracts the locked disable/deactivate/revoke-all transaction bodies into user-mutations.ts', () => {
    const lib = readFileSync(join(process.cwd(), 'src/lib/user-mutations.ts'), 'utf8')

    // The lock + revoke live in the extracted functions, NOT the route — this is
    // what lets the integration suite inject afterLock/beforeCommit hooks directly.
    expect(lib).toContain('export function lockUsers') // routes take the ordered lock via this, never inline
    expect(lib).toContain('export async function disableCapability')
    expect(lib).toContain('export async function deactivateUsers')
    expect(lib).toContain('export async function revokeAllForUser')
    expect(lib).toContain(".for('update')") // drizzle SELECT … FOR UPDATE
    expect(lib).toContain('.orderBy(asc(user.id))') // deterministic id order for bulk locks
    expect(lib).toContain('hooks?.afterLock')
    expect(lib).toContain('hooks?.beforeCommit')
  })

  it('disabling the CI capability flag revokes with reason ci_tokens_disabled, not access_changed', () => {
    const lib = readFileSync(join(process.cwd(), 'src/lib/user-mutations.ts'), 'utf8')

    const disableBlock = mustSlice(
      lib,
      'export async function disableCapability',
      'export async function deactivateUsers',
    )

    expect(disableBlock).toContain('lockUsers(executor, userIds)')
    expect(disableBlock).toContain('ciTokensEnabled: false')
    expect(disableBlock).toContain('revokeMcpTokensNoLongerAllowed')
    expect(disableBlock).toContain("'ci_tokens_disabled'")
    expect(disableBlock).not.toContain('access_changed')
  })

  it('deactivation revokes both static token shapes and the OAuth grants, locked in id order', () => {
    const lib = readFileSync(join(process.cwd(), 'src/lib/user-mutations.ts'), 'utf8')

    const deactivateBlock = mustSlice(
      lib,
      'export async function deactivateUsers',
      'export async function revokeAllForUser',
    )

    expect(deactivateBlock).toContain('lockUsers(executor, userIds)')
    expect(deactivateBlock).toContain('deactivatedAt: new Date()')
    expect(deactivateBlock).toContain('revokeActiveMcpTokensForUsers')
    expect(deactivateBlock).toContain("'user_deactivated'")
    expect(deactivateBlock).toContain('revokeGrantsForUser')
  })

  it('revoke-all sets the flag false and revokes both static shapes, leaving OAuth grants untouched', () => {
    const lib = readFileSync(join(process.cwd(), 'src/lib/user-mutations.ts'), 'utf8')

    const revokeAllBlock = mustSlice(lib, 'export async function revokeAllForUser')

    expect(revokeAllBlock).toContain('lockUsers(executor, [userId])')
    expect(revokeAllBlock).toContain('ciTokensEnabled: false')
    expect(revokeAllBlock).toContain('revokeActiveMcpTokensForUser')
    expect(revokeAllBlock).toContain("'admin_user_revoke_all'")
    expect(revokeAllBlock).not.toContain('revokeGrantsForUser')
  })

  it('routes delegate to the extracted mutations and stay thin, with no inline lock or transaction body', () => {
    const source = readFileSync(join(process.cwd(), 'src/routes/users.ts'), 'utf8')

    expect(source).toContain('db.transaction')
    expect(source).toContain('disableCapability(tx')
    expect(source).toContain('deactivateUsers(tx')
    expect(source).toContain('revokeAllForUser(tx')
    expect(source).not.toContain(".for('update')") // the lock is NOT in the route
  })

  it('PUT /:id folds other field writes into the same transaction before disableCapability revokes', () => {
    const source = readFileSync(join(process.cwd(), 'src/routes/users.ts'), 'utf8')

    const putHandler = mustSlice(
      source,
      "userManagementRoutes.put('/:id'",
      "userManagementRoutes.post('/:id/mcp-tokens/revoke-all'",
    )

    // The other-field update runs before disableCapability is invoked, in the same
    // tx, so revokeMcpTokensNoLongerAllowed's scoping check (inside disableCapability)
    // sees this request's post-write state rather than the pre-request row.
    expect(mustIndexOf(putHandler, '.update(user)')).toBeLessThan(
      mustIndexOf(putHandler, 'disableCapability(tx'),
    )
    // Flag changes stay OUT of the post-tx access_changed sweep: disable revokes
    // atomically in-tx (disableCapability), and a pure enable never reduces access.
    expect(putHandler).not.toContain('body.ciTokensEnabled !== undefined')
  })

  it('bulk PATCH keeps flag changes out of the access_changed sweep (handled in-tx)', () => {
    const source = readFileSync(join(process.cwd(), 'src/routes/users.ts'), 'utf8')

    const bulkHandler = mustSlice(
      source,
      "userManagementRoutes.patch('/bulk'",
      "userManagementRoutes.get('/:id'",
    )

    expect(bulkHandler).toContain('body.ciTokensEnabled === undefined')
    // Disable revokes atomically in-tx via disableCapability; enable never revokes —
    // so the post-tx sweep condition must not mention the flag at all.
    expect(bulkHandler).not.toContain('body.ciTokensEnabled !== undefined')
    expect(bulkHandler).toContain('disableCapability(tx')
    expect(bulkHandler).toContain('deactivateUsers(tx')
  })

  it('bulk transactions acquire the ordered user lock first, before the patch UPDATE', () => {
    const source = readFileSync(join(process.cwd(), 'src/routes/users.ts'), 'utf8')

    const bulkHandler = mustSlice(
      source,
      "userManagementRoutes.patch('/bulk'",
      "userManagementRoutes.get('/:id'",
    )
    const deactivatingBranch = mustSlice(
      bulkHandler,
      'if (deactivating) {',
      '} else if (disablingCiTokens) {',
    )
    const disablingBranch = mustSlice(bulkHandler, '} else if (disablingCiTokens) {', '} else {')

    // The ordered lock must be the transaction's FIRST statement: running the
    // plain patch UPDATE first would acquire row locks in planner scan order,
    // never delivering the ORDER BY id deadlock-avoidance lockUsers exists for.
    for (const branch of [deactivatingBranch, disablingBranch]) {
      expect(mustIndexOf(branch, 'lockUsers(tx, body.userIds)')).toBeLessThan(
        mustIndexOf(branch, '.update(user)'),
      )
    }
  })

  it('does not add a self-guard on ciTokensEnabled, unlike role or deactivated', () => {
    const source = readFileSync(join(process.cwd(), 'src/routes/users.ts'), 'utf8')

    // Existing self-guards on role/deactivated remain untouched.
    expect(source).toContain('Cannot change your own admin role')
    expect(source).toContain('Cannot deactivate your own account')
    // The design is explicit: a sole admin must be able to enable or disable their
    // own CI capability, so no equivalent guard exists for ciTokensEnabled.
    expect(source).toContain('No self-guard on ciTokensEnabled')
  })

  it('reactivation is unchanged: clears deactivated_at only, no revocation, no flag change', () => {
    const source = readFileSync(join(process.cwd(), 'src/routes/users.ts'), 'utf8')

    const reactivateHandler = mustSlice(
      source,
      "userManagementRoutes.post('/:id/reactivate'",
      "userManagementRoutes.post('/:id/resend-invite'",
    )

    expect(reactivateHandler).toContain('deactivatedAt: null')
    expect(reactivateHandler).not.toContain('ciTokensEnabled')
    expect(reactivateHandler).not.toContain('revoke')
    expect(reactivateHandler).not.toContain('db.transaction')
  })
})
