import {
  account,
  db,
  groupRepositories,
  groups,
  mcpOauthToken,
  mcpTokenAlerts,
  mcpTokens,
  repositories,
  session,
  user,
} from '@convergekit/db'
import { buildCohortSelect } from '@convergekit/db/backfill-ci-token-capability'
import { eq, inArray, sql } from 'drizzle-orm'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { createMcpTokenSecret } from '../lib/mcp-token-policy.js'

// Shared seed/cleanup/race helpers for the Task 15b real-Postgres integration
// suite (apps/api). Mirrors the proven patterns from Task 15a's
// packages/db/src/ci-token-capability.integration.test.ts:
//   - real `db` import (no mocking), connects to the SHARED local dev DB
//   - every seeded row is tagged with an `it-15b-<file>-` prefix and torn down
//     by exact id in a finally/afterAll — NEVER truncate a shared table
//   - a beforeAll safety-net sweep purges leftovers from a crashed prior run
//   - race barriers use resolve-reached/await-release with try/finally release
//
// Each integration test FILE should use its OWN `filePrefix` (e.g. 'races',
// 'atomicity', 'backfill', 'mcp', 'authz') so that one file's beforeAll sweep
// can never delete another file's in-flight seed rows. Cross-file collisions
// are additionally ruled out by `fileParallelism: false` in
// vitest.integration.config.ts, which serializes all integration test files —
// several of these tests take a table-level lock on "user", which would
// otherwise stall (though not deadlock) unrelated concurrently-running files.

// Load-bearing: must be the access policy's allowed email domain — requireAuth
// rejects any session whose user email is off-domain, so a "sanitized" synthetic
// domain here turns every authz test into an unexplained wall of 401s.
export const EMAIL_DOMAIN = 'example.com'
// Frozen forever: renaming this orphans crashed-run leftovers under the old
// prefix (the sweep pattern moves with the constant). The '15b' is historical.
export const PREFIX_ROOT = 'it-15b'

export function emailPrefixFor(filePrefix: string): string {
  return `${PREFIX_ROOT}-${filePrefix}-`
}

export function uniqueSuffix(): string {
  return randomUUID()
}

type UserOverrides = Partial<typeof user.$inferInsert>
type RepositoryOverrides = Partial<typeof repositories.$inferInsert>
type TokenOverrides = Partial<typeof mcpTokens.$inferInsert>
type GroupOverrides = Partial<typeof groups.$inferInsert>
type OAuthGrantOverrides = Partial<typeof mcpOauthToken.$inferInsert>
type AlertOverrides = Partial<typeof mcpTokenAlerts.$inferInsert>

/** Scoped seeding/cleanup helper bound to one integration test file's prefix. */
export function makeFixture(filePrefix: string) {
  if (!/^[a-z0-9-]+$/.test(filePrefix)) {
    // '_' and '%' are LIKE wildcards — an unvalidated prefix would silently
    // widen the sweep patterns beyond this file's own rows.
    throw new Error(`makeFixture: filePrefix must match [a-z0-9-]+, got '${filePrefix}'`)
  }
  const emailPrefix = emailPrefixFor(filePrefix)
  const idPrefix = `${PREFIX_ROOT}-${filePrefix}`

  async function seedUser(overrides: UserOverrides = {}) {
    const now = new Date()
    const [row] = await db
      .insert(user)
      .values({
        id: `${idPrefix}-user-${uniqueSuffix()}`,
        name: `IT-15B ${filePrefix} user`,
        email: `${emailPrefix}${uniqueSuffix()}@${EMAIL_DOMAIN}`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
        role: 'user',
        ciTokensEnabled: false,
        ...overrides,
      })
      .returning()
    if (!row) throw new Error('seedUser: insert returned no row')
    return row
  }

  async function seedRepository(ownerId: string, overrides: RepositoryOverrides = {}) {
    const [row] = await db
      .insert(repositories)
      .values({
        userId: ownerId,
        name: `${idPrefix}-repo-${uniqueSuffix()}`,
        cloneUrl: `https://github.com/example-org/${idPrefix}-${uniqueSuffix()}`,
        provider: 'github',
        ...overrides,
      })
      .returning()
    if (!row) throw new Error('seedRepository: insert returned no row')
    return row
  }

  /** repositoryId: null → user-level CI token. Set it for a legacy per-repo token. */
  async function seedToken(ownerId: string, overrides: TokenOverrides = {}) {
    const [row] = await db
      .insert(mcpTokens)
      .values({
        userId: ownerId,
        repositoryId: null,
        tokenHash: `${idPrefix}-hash-${uniqueSuffix()}`,
        fingerprint: `${idPrefix}-fp-${uniqueSuffix()}`,
        label: `${idPrefix} token`,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        ...overrides,
      })
      .returning()
    if (!row) throw new Error('seedToken: insert returned no row')
    return row
  }

  /** Same as seedToken, but mints a real secret so the raw bearer value can authenticate. */
  async function seedTokenWithSecret(ownerId: string, overrides: TokenOverrides = {}) {
    const { rawToken, tokenHash, fingerprint } = createMcpTokenSecret()
    const row = await seedToken(ownerId, { tokenHash, fingerprint, ...overrides })
    return { row, rawToken }
  }

  async function seedGroup(overrides: GroupOverrides = {}) {
    const [row] = await db
      .insert(groups)
      .values({
        id: `${idPrefix}-group-${uniqueSuffix()}`,
        name: `${idPrefix}-group-${uniqueSuffix()}`,
        ...overrides,
      })
      .returning()
    if (!row) throw new Error('seedGroup: insert returned no row')
    return row
  }

  async function seedGroupRepository(groupId: string, repositoryId: string) {
    const [row] = await db.insert(groupRepositories).values({ groupId, repositoryId }).returning()
    if (!row) throw new Error('seedGroupRepository: insert returned no row')
    return row
  }

  async function seedOAuthGrant(userId: string, overrides: OAuthGrantOverrides = {}) {
    const now = new Date()
    const [row] = await db
      .insert(mcpOauthToken)
      .values({
        familyId: randomUUID(),
        userId,
        clientId: `${idPrefix}-client-${uniqueSuffix()}`,
        accessTokenHash: `${idPrefix}-access-hash-${uniqueSuffix()}`,
        refreshTokenHash: `${idPrefix}-refresh-hash-${uniqueSuffix()}`,
        scopes: ['repo:read'],
        accessTokenExpiresAt: new Date(now.getTime() + 1000 * 60 * 60),
        refreshTokenExpiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 60),
        absoluteExpiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 60),
        ...overrides,
      })
      .returning()
    if (!row) throw new Error('seedOAuthGrant: insert returned no row')
    return row
  }

  async function seedAlert(tokenId: string, userId: string, overrides: AlertOverrides = {}) {
    const [row] = await db
      .insert(mcpTokenAlerts)
      .values({
        tokenId,
        userId,
        kind: 'ip_changed',
        message: `${idPrefix} test alert`,
        ...overrides,
      })
      .returning()
    if (!row) throw new Error('seedAlert: insert returned no row')
    return row
  }

  /** Inserts a session row and returns the raw token + a ready-to-send Cookie header. */
  async function seedSessionCookie(
    userId: string,
    overrides: Partial<typeof session.$inferInsert> = {},
  ) {
    const now = new Date()
    const rawToken = randomBytes(32).toString('hex')
    const [row] = await db
      .insert(session)
      .values({
        id: `${idPrefix}-session-${uniqueSuffix()}`,
        token: rawToken,
        userId,
        expiresAt: new Date(now.getTime() + 1000 * 60 * 60),
        createdAt: now,
        updatedAt: now,
        ...overrides,
      })
      .returning()
    if (!row) throw new Error('seedSessionCookie: insert returned no row')
    return { session: row, cookie: mintCookieHeader(rawToken) }
  }

  /** Seeds a fake-but-structurally-valid linked GitHub account row for an admin session. */
  async function seedGitHubAccount(userId: string) {
    const now = new Date()
    const [row] = await db
      .insert(account)
      .values({
        id: `${idPrefix}-account-${uniqueSuffix()}`,
        accountId: `${idPrefix}-gh-${uniqueSuffix()}`,
        providerId: 'github',
        userId,
        accessToken: `${idPrefix}-fake-gh-token`,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    if (!row) throw new Error('seedGitHubAccount: insert returned no row')
    return row
  }

  /** Deletes seeded top-level users; FK cascades remove their sessions, accounts,
   * repositories, mcp_tokens, mcp_token_alerts, and mcp_oauth_token rows. */
  async function deleteUsers(ids: string[]) {
    if (ids.length === 0) return
    await db.delete(user).where(inArray(user.id, ids))
  }

  /** Groups are independent entities (not owned by a user) — delete explicitly.
   * Cascades their group_repositories rows. */
  async function deleteGroups(ids: string[]) {
    if (ids.length === 0) return
    await db.delete(groups).where(inArray(groups.id, ids))
  }

  /** Safety net: purge any leftovers from a crashed prior run of THIS file only
   * (scoped by this file's own emailPrefix/idPrefix — never a wholesale truncate). */
  async function sweepLeftovers() {
    const leftoverUsers = (await db.execute(
      sql`SELECT id FROM "user" WHERE email LIKE ${`${emailPrefix}%@${EMAIL_DOMAIN}`}`,
    )) as unknown as { id: string }[]
    if (leftoverUsers.length > 0) {
      console.warn(
        `[it-15b:${filePrefix}] purging ${leftoverUsers.length} leftover user(s) from a previous run`,
      )
      await deleteUsers(leftoverUsers.map((row) => row.id))
    }

    const leftoverGroups = (await db.execute(
      sql`SELECT id FROM "groups" WHERE id LIKE ${`${idPrefix}-group-%`}`,
    )) as unknown as { id: string }[]
    if (leftoverGroups.length > 0) {
      console.warn(
        `[it-15b:${filePrefix}] purging ${leftoverGroups.length} leftover group(s) from a previous run`,
      )
      await deleteGroups(leftoverGroups.map((row) => row.id))
    }
  }

  return {
    emailPrefix,
    idPrefix,
    seedUser,
    seedRepository,
    seedToken,
    seedTokenWithSecret,
    seedGroup,
    seedGroupRepository,
    seedOAuthGrant,
    seedAlert,
    seedSessionCookie,
    seedGitHubAccount,
    deleteUsers,
    deleteGroups,
    sweepLeftovers,
  }
}

// ─── better-auth session cookie minting ────────────────────────────────────────
//
// requireAuth calls `auth.api.getSession({ headers })`, which reads the
// `better-auth.session_token` cookie via better-auth's own signed-cookie
// helper (better-call's `getSignedCookie`, see
// node_modules/better-call/dist/context.mjs + crypto.mjs + cookies.mjs).
// The cookie VALUE is `${sessionToken}.${signature}` URI-encoded, where
// `signature` is the standard-base64 HMAC-SHA256 of `sessionToken` keyed by
// BETTER_AUTH_SECRET (44 chars, must end with '='). better-auth then looks the
// decoded `sessionToken` up directly against `session.token` — so minting a
// valid session for a test is: insert a `session` row with an arbitrary raw
// token, then sign that SAME raw string here with the same secret.
//
// Cookie NAME: `${prefix}.${cookieName}` = `better-auth.session_token` (no
// `__Secure-` prefix in either environment — BETTER_AUTH_URL is a plain-http
// localhost URL locally and UNSET in CI, where packages/auth falls back to
// http://localhost:3001; both are non-https and NODE_ENV isn't 'production',
// so better-auth's `useSecureCookies` auto-detection resolves to false).
// Verified empirically against a running `createApp()` instance hitting
// GET /api/me (200, real user JSON returned), with better-auth 1.6.9 — if a
// version bump 401s this whole suite, re-derive the signing scheme from the
// better-call source files named above before touching anything else.
export function mintCookieHeader(rawSessionToken: string): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) {
    throw new Error(
      'BETTER_AUTH_SECRET is not set — integration tests must run with apps/api/.env exported ' +
        '(e.g. `set -a && source apps/api/.env && set +a` before `pnpm --filter @convergekit/api test:integration`)',
    )
  }
  const signature = createHmac('sha256', secret).update(rawSessionToken).digest('base64')
  const value = encodeURIComponent(`${rawSessionToken}.${signature}`)
  return `better-auth.session_token=${value}`
}

// ─── Race barriers ──────────────────────────────────────────────────────────────

export type Barrier = {
  /** Pass as `{ afterLock: barrier.hooks.afterLock }` to the hookable function under test. */
  hooks: { afterLock: () => Promise<void> }
  /** True once the held transaction has reached (and is now parked at) the barrier. */
  isReached: () => boolean
  /** Lets the parked transaction continue. MUST be called even if assertions throw
   * (wrap the "assert blocked" check in try/finally) — otherwise the holder's
   * transaction hangs forever holding its lock, wedging the shared dev DB for
   * every other session. */
  release: () => void
}

export function createBarrier(): Barrier {
  let reached = false
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  return {
    hooks: {
      afterLock: async () => {
        reached = true
        await gate
      },
    },
    isReached: () => reached,
    release: () => release(),
  }
}

export async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 20,
): Promise<void> {
  const start = Date.now()
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitUntil: timed out waiting for condition')
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

/**
 * Cohort membership depends on live `user`/`mcp_tokens` rows outside our
 * control (this is the shared local dev DB). Snapshotting the ambient cohort
 * before seeding — and asserting against `ambient + seeded` rather than a
 * hardcoded literal — keeps these tests correct regardless of what else is in
 * the database, while still failing loudly on a real regression. Mirrors
 * packages/db/src/ci-token-capability.integration.test.ts's own helper.
 */
export async function getAmbientCohortIds(): Promise<Set<string>> {
  const rows = await buildCohortSelect(db)
  return new Set(rows.map((row) => row.id))
}

// ─── pg_locks introspection (via the GLOBAL pool, never `tx`) ──────────────────
//
// Row locks taken by `SELECT ... FOR UPDATE` live in tuple headers, not
// pg_locks — only the RELATION-level intent lock (e.g. RowShareLock for a FOR
// UPDATE, ExclusiveLock for `LOCK TABLE ... IN EXCLUSIVE MODE`) is visible
// there. These helpers assert relation-level wait/hold state on `"user"`.

export async function countUserTableLocks(mode: string, granted: boolean): Promise<number> {
  const rows = (await db.execute(sql`
    SELECT 1 FROM pg_locks
    WHERE relation = '"user"'::regclass AND locktype = 'relation' AND mode = ${mode} AND granted = ${granted}
  `)) as unknown as unknown[]
  return rows.length
}

// ─── Backfill marker (manual_migrations) ───────────────────────────────────────
//
// Mirrors the private marker filename inside backfill-ci-token-capability.ts.
// Not exported from there on purpose (it's an implementation constant); the
// module's own unit test pins the literal string, so drift is caught there.
export const BACKFILL_MARKER_FILENAME = '0024_ci_token_capability_backfill'

export async function getBackfillMarkerRowCount(): Promise<number> {
  const rows = (await db.execute(
    sql`SELECT 1 FROM "manual_migrations" WHERE "filename" = ${BACKFILL_MARKER_FILENAME}`,
  )) as unknown as unknown[]
  return rows.length
}

export async function deleteBackfillMarkerRow(): Promise<void> {
  await db.execute(
    sql`DELETE FROM "manual_migrations" WHERE "filename" = ${BACKFILL_MARKER_FILENAME}`,
  )
}

export async function resetCiTokensEnabledFlag(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await db.update(user).set({ ciTokensEnabled: false }).where(inArray(user.id, ids))
}

// Snapshot BEFORE an armed backfill run: cleanup must RESTORE, not force-false —
// filter the granted ids against this so an ambient dev-DB user whose flag was
// already legitimately on is never disabled by test cleanup.
export async function getFlagOnUserIds(): Promise<Set<string>> {
  const rows = await db.select({ id: user.id }).from(user).where(eq(user.ciTokensEnabled, true))
  return new Set(rows.map((row) => row.id))
}
