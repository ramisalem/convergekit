import { closeDbConnection, db, mcpTokens } from '@convergekit/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { makeFixture } from './support.js'

// Real-Postgres integration suite (Task 15b, file 2 of 2): HTTP route
// authorization — exact status-code contracts for /api/me/ci-tokens and
// /api/admin/ci-tokens, driven through the REAL Hono app via `app.request()`.
//
// AUTH MECHANISM: `requireAuth` (apps/api/src/middleware/require-auth.ts)
// calls `auth.api.getSession({ headers })`, which reads the
// `better-auth.session_token` cookie via better-auth's signed-cookie helper.
// Sessions are minted here by inserting real `user` + `session` rows and
// sending a cookie whose value is `${sessionToken}.${signature}` (URI-encoded),
// where `signature` is the standard-base64 HMAC-SHA256 of `sessionToken` keyed
// by BETTER_AUTH_SECRET — see support.ts's `mintCookieHeader` for the full
// derivation (reverse-engineered from better-call's cookie/crypto internals
// and verified empirically: GET /api/me returns 200 with the real user JSON).
//
// MOCKING: requireAuth additionally verifies GitHub-org membership for
// role='admin' sessions via a REAL `fetch` to api.github.com
// (verifyGitHubOrganizationAccess in ../lib/github-access.js) — that is the
// one external call in requireAuth, and per the task's instruction it is the
// ONLY thing mocked here (confirmed empirically: an unmocked admin session
// gets a real 403 from a failed GitHub call). Everything else — db, Redis,
// the app's routing/middleware/business logic — is real.
//
// Every seed is tagged `it-15b-authz-*` and torn down by exact id.

const mocks = vi.hoisted(() => ({
  verifyGitHubOrganizationAccess: vi.fn(),
}))
vi.mock('../lib/github-access.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/github-access.js')>()
  return { ...actual, verifyGitHubOrganizationAccess: mocks.verifyGitHubOrganizationAccess }
})

const fx = makeFixture('authz')
const app = createApp()

async function assertStatus(res: Response, expected: number, label: string): Promise<Response> {
  const bodyText = await res
    .clone()
    .text()
    .catch(() => '<unreadable body>')
  expect(res.status, `${label} — got ${res.status}, body: ${bodyText}`).toBe(expected)
  return res
}

function cookieHeaders(cookie: string, extra: Record<string, string> = {}) {
  return { Cookie: cookie, ...extra }
}

function jsonHeaders(cookie: string) {
  return { Cookie: cookie, 'Content-Type': 'application/json' }
}

describe('ci-token authz: HTTP route status-code contracts (real Postgres, real app.request())', () => {
  beforeAll(async () => {
    await fx.sweepLeftovers()
  })

  afterAll(async () => {
    await closeDbConnection()
  })

  describe('cross-user scoping + list shape (User A vs User B)', () => {
    const seededUserIds: string[] = []
    let userA: Awaited<ReturnType<typeof fx.seedUser>>
    let userB: Awaited<ReturnType<typeof fx.seedUser>>
    let cookieA: string
    let cookieB: string
    let aRepo: Awaited<ReturnType<typeof fx.seedRepository>>
    let bRepo: Awaited<ReturnType<typeof fx.seedRepository>>
    let aUserLevelToken: Awaited<ReturnType<typeof fx.seedToken>>
    let aLegacyToken: Awaited<ReturnType<typeof fx.seedToken>>
    let bUserLevelToken: Awaited<ReturnType<typeof fx.seedToken>>
    let bLegacyToken: Awaited<ReturnType<typeof fx.seedToken>>
    let bAlertOnUserLevel: Awaited<ReturnType<typeof fx.seedAlert>>

    beforeAll(async () => {
      userA = await fx.seedUser({ ciTokensEnabled: true })
      userB = await fx.seedUser({ ciTokensEnabled: true })
      seededUserIds.push(userA.id, userB.id)
      ;({ cookie: cookieA } = await fx.seedSessionCookie(userA.id))
      ;({ cookie: cookieB } = await fx.seedSessionCookie(userB.id))

      aRepo = await fx.seedRepository(userA.id)
      bRepo = await fx.seedRepository(userB.id)

      aUserLevelToken = await fx.seedToken(userA.id)
      aLegacyToken = await fx.seedToken(userA.id, { repositoryId: aRepo.id })
      bUserLevelToken = await fx.seedToken(userB.id)
      bLegacyToken = await fx.seedToken(userB.id, { repositoryId: bRepo.id })

      await fx.seedAlert(aUserLevelToken.id, userA.id)
      await fx.seedAlert(aLegacyToken.id, userA.id)
      bAlertOnUserLevel = await fx.seedAlert(bUserLevelToken.id, userB.id)
      await fx.seedAlert(bLegacyToken.id, userB.id)
    })

    afterAll(async () => {
      await fx.deleteUsers(seededUserIds)
    })

    it("GET /api/me/ci-tokens as A -> 200, only A's user-level row (B's omitted)", async () => {
      const res = await assertStatus(
        await app.request('/api/me/ci-tokens', { headers: cookieHeaders(cookieA) }),
        200,
        'GET /api/me/ci-tokens as A',
      )
      const body = (await res.json()) as { tokens: { id: string }[] }
      const ids = body.tokens.map((t) => t.id)
      expect(ids).toContain(aUserLevelToken.id)
      expect(ids).not.toContain(bUserLevelToken.id)
    })

    it("GET /api/me/ci-tokens/legacy as A -> 200, only A's legacy row; repository {id,name} with no owner key", async () => {
      const res = await assertStatus(
        await app.request('/api/me/ci-tokens/legacy', { headers: cookieHeaders(cookieA) }),
        200,
        'GET /api/me/ci-tokens/legacy as A',
      )
      const body = (await res.json()) as {
        tokens: { id: string; repository: { id: string; name: string }; owner?: unknown }[]
      }
      const ids = body.tokens.map((t) => t.id)
      expect(ids).toContain(aLegacyToken.id)
      expect(ids).not.toContain(bLegacyToken.id)
      const row = body.tokens.find((t) => t.id === aLegacyToken.id)!
      expect(row.repository).toEqual({ id: aRepo.id, name: aRepo.name })
      expect(row.owner).toBeUndefined()
    })

    it("A acting on B's user-level token id gets 404 on every scoped action (no existence leak)", async () => {
      await assertStatus(
        await app.request(`/api/me/ci-tokens/${bUserLevelToken.id}/renew`, {
          method: 'POST',
          headers: cookieHeaders(cookieA),
        }),
        404,
        'renew',
      )
      await assertStatus(
        await app.request(`/api/me/ci-tokens/${bUserLevelToken.id}/test`, {
          method: 'POST',
          headers: jsonHeaders(cookieA),
          body: JSON.stringify({}),
        }),
        404,
        'test',
      )
      await assertStatus(
        await app.request(`/api/me/ci-tokens/${bUserLevelToken.id}/config`, {
          headers: cookieHeaders(cookieA),
        }),
        404,
        'config',
      )
      await assertStatus(
        await app.request(`/api/me/ci-tokens/${bUserLevelToken.id}/audit`, {
          headers: cookieHeaders(cookieA),
        }),
        404,
        'audit',
      )
      await assertStatus(
        await app.request(`/api/me/ci-tokens/${bUserLevelToken.id}/alerts`, {
          headers: cookieHeaders(cookieA),
        }),
        404,
        'alerts',
      )
      await assertStatus(
        await app.request(
          `/api/me/ci-tokens/${bUserLevelToken.id}/alerts/${bAlertOnUserLevel.id}/acknowledge`,
          { method: 'POST', headers: cookieHeaders(cookieA) },
        ),
        404,
        'acknowledge',
      )
      await assertStatus(
        await app.request(`/api/me/ci-tokens/${bUserLevelToken.id}`, {
          method: 'DELETE',
          headers: cookieHeaders(cookieA),
        }),
        404,
        'revoke (DELETE)',
      )
    })

    it("A DELETE-ing B's legacy token id gets 404", async () => {
      await assertStatus(
        await app.request(`/api/me/ci-tokens/legacy/${bLegacyToken.id}`, {
          method: 'DELETE',
          headers: cookieHeaders(cookieA),
        }),
        404,
        'DELETE /api/me/ci-tokens/legacy/:bLegacyId as A',
      )
    })

    // Shape axis, not ownership axis: the caller OWNS this token and their
    // capability flag is on, so any non-404 here could only come from the
    // routes' repository_id IS NULL shape pin (findCiToken / the delete's
    // WHERE), which is exactly what these two tests exist to hold in place.
    it("A's OWN legacy token id on the user-level-only self-service routes -> 404 each, and nothing gets revoked", async () => {
      await assertStatus(
        await app.request(`/api/me/ci-tokens/${aLegacyToken.id}/config`, {
          headers: cookieHeaders(cookieA),
        }),
        404,
        'config (own legacy id on user-level route)',
      )
      // Renew reaches assertOwnedCiToken only AFTER the row lock + capability
      // re-check pass for A — so this 404 is attributable to the shape filter,
      // not the flag gate.
      await assertStatus(
        await app.request(`/api/me/ci-tokens/${aLegacyToken.id}/renew`, {
          method: 'POST',
          headers: cookieHeaders(cookieA),
        }),
        404,
        'renew (own legacy id on user-level route)',
      )
      // The user-level DELETE's WHERE pins isNull(repositoryId) in the UPDATE
      // itself — a legacy row must be untouchable through it no matter what.
      await assertStatus(
        await app.request(`/api/me/ci-tokens/${aLegacyToken.id}`, {
          method: 'DELETE',
          headers: cookieHeaders(cookieA),
        }),
        404,
        'DELETE (own legacy id on user-level route)',
      )

      const [row] = await db
        .select({ revokedAt: mcpTokens.revokedAt })
        .from(mcpTokens)
        .where(eq(mcpTokens.id, aLegacyToken.id))
      expect(
        row?.revokedAt,
        'own legacy token must survive the wrong-shape DELETE unrevoked',
      ).toBeNull()
    })

    it("A's OWN user-level token id on DELETE /api/me/ci-tokens/legacy/:id -> 404, and nothing gets revoked", async () => {
      await assertStatus(
        await app.request(`/api/me/ci-tokens/legacy/${aUserLevelToken.id}`, {
          method: 'DELETE',
          headers: cookieHeaders(cookieA),
        }),
        404,
        'DELETE legacy route (own user-level id)',
      )

      const [row] = await db
        .select({ revokedAt: mcpTokens.revokedAt })
        .from(mcpTokens)
        .where(eq(mcpTokens.id, aUserLevelToken.id))
      expect(
        row?.revokedAt,
        'own user-level token must survive the wrong-shape legacy DELETE unrevoked',
      ).toBeNull()
    })

    it("alert-ack cross-axis: A's own token id + B's alert id -> 404", async () => {
      await assertStatus(
        await app.request(
          `/api/me/ci-tokens/${aUserLevelToken.id}/alerts/${bAlertOnUserLevel.id}/acknowledge`,
          { method: 'POST', headers: cookieHeaders(cookieA) },
        ),
        404,
        'acknowledge (own token id, foreign alert id)',
      )
    })

    it('a well-formed but nonexistent token id 404s (not a leak, not a crash)', async () => {
      const nonexistentId = '00000000-0000-0000-0000-000000000000'
      await assertStatus(
        await app.request(`/api/me/ci-tokens/${nonexistentId}/config`, {
          headers: cookieHeaders(cookieA),
        }),
        404,
        'GET config for a random well-formed uuid',
      )
    })

    // Pins an ACTUAL (not aspirational) behavior found while writing this
    // suite: `mcpTokens.id` is a `uuid` column, and `assertCiToken`/
    // `assertAnyCiToken` pass the raw path param straight into `eq(mcpTokens.id, tokenId)`
    // with no format pre-check. Postgres rejects a non-UUID-shaped value at
    // the wire/bind level (`invalid input syntax for type uuid`), which
    // isn't an AppError/ZodError, so app.ts's onError falls through to its
    // generic 500 handler — NOT the clean 404 a route-level id-format guard
    // would give. Confirmed empirically against the real app + real Postgres.
    // This is a pre-existing minor hardening gap (noisy 500 + logged stack
    // trace instead of a quiet 404; no additional information is disclosed
    // vs. a 404, so it is not an authz/enumeration leak) — out of scope to
    // fix under this integration-test task, so it is pinned as current
    // behavior rather than silently asserted-away as 404.
    it('a malformed (non-uuid-shaped) token id 500s — pre-existing gap, not a 404 (pinned, not fixed, here)', async () => {
      await assertStatus(
        await app.request('/api/me/ci-tokens/not-a-uuid/config', {
          headers: cookieHeaders(cookieA),
        }),
        500,
        'GET config for a malformed id',
      )
    })
  })

  describe('capability flag + deactivation gating', () => {
    const seededUserIds: string[] = []

    afterAll(async () => {
      await fx.deleteUsers(seededUserIds)
    })

    it('flag-off ACTIVE caller: POST create -> 403', async () => {
      const owner = await fx.seedUser({ ciTokensEnabled: false })
      seededUserIds.push(owner.id)
      const { cookie } = await fx.seedSessionCookie(owner.id)

      await assertStatus(
        await app.request('/api/me/ci-tokens', {
          method: 'POST',
          headers: jsonHeaders(cookie),
          body: JSON.stringify({ label: 'should not be created' }),
        }),
        403,
        'POST /api/me/ci-tokens with flag off',
      )
    })

    it('flag-off ACTIVE caller: POST renew -> 403', async () => {
      const owner = await fx.seedUser({ ciTokensEnabled: false })
      seededUserIds.push(owner.id)
      const { cookie } = await fx.seedSessionCookie(owner.id)
      const token = await fx.seedToken(owner.id)

      await assertStatus(
        await app.request(`/api/me/ci-tokens/${token.id}/renew`, {
          method: 'POST',
          headers: cookieHeaders(cookie),
        }),
        403,
        'POST renew with flag off',
      )
    })

    it('deactivated caller -> 401 from requireAuth (without weakening requireAuth)', async () => {
      const owner = await fx.seedUser({ deactivatedAt: new Date() })
      seededUserIds.push(owner.id)
      const { cookie } = await fx.seedSessionCookie(owner.id)

      await assertStatus(
        await app.request('/api/me/ci-tokens', { headers: cookieHeaders(cookie) }),
        401,
        'GET /api/me/ci-tokens as a deactivated user',
      )
    })
  })

  describe('renew edge cases', () => {
    const seededUserIds: string[] = []

    afterAll(async () => {
      await fx.deleteUsers(seededUserIds)
    })

    it('renew-of-revoked (own token) -> 404', async () => {
      const owner = await fx.seedUser({ ciTokensEnabled: true })
      seededUserIds.push(owner.id)
      const { cookie } = await fx.seedSessionCookie(owner.id)
      const revoked = await fx.seedToken(owner.id, {
        revokedAt: new Date(),
        revokedReason: 'user_revoke',
      })

      await assertStatus(
        await app.request(`/api/me/ci-tokens/${revoked.id}/renew`, {
          method: 'POST',
          headers: cookieHeaders(cookie),
        }),
        404,
        'renew of a revoked own token',
      )
    })

    it('renew-of-expired (own token) -> 200 with a fresh token', async () => {
      const owner = await fx.seedUser({ ciTokensEnabled: true })
      seededUserIds.push(owner.id)
      const { cookie } = await fx.seedSessionCookie(owner.id)
      const expired = await fx.seedToken(owner.id, {
        expiresAt: new Date(Date.now() - 1000 * 60),
      })

      const res = await assertStatus(
        await app.request(`/api/me/ci-tokens/${expired.id}/renew`, {
          method: 'POST',
          headers: cookieHeaders(cookie),
        }),
        200,
        'renew of an expired own token',
      )
      const body = (await res.json()) as { token: string; tokenDetails: { id: string } }
      expect(typeof body.token).toBe('string')
      expect(body.token.length).toBeGreaterThan(0)
      expect(body.tokenDetails.id).not.toBe(expired.id)

      const [oldRow] = await db
        .select({ revokedAt: mcpTokens.revokedAt, revokedReason: mcpTokens.revokedReason })
        .from(mcpTokens)
        .where(eq(mcpTokens.id, expired.id))
      expect(oldRow?.revokedAt).not.toBeNull()
      expect(oldRow?.revokedReason).toBe('rotated')
    })
  })

  describe('admin oversight', () => {
    const seededUserIds: string[] = []
    let adminCookie: string
    let ownerId: string
    let repoId: string
    let legacyTokenId: string
    let legacyAlertId: string

    beforeAll(async () => {
      mocks.verifyGitHubOrganizationAccess.mockResolvedValue({ allowed: true, reason: null })

      const admin = await fx.seedUser({ role: 'admin' })
      seededUserIds.push(admin.id)
      await fx.seedGitHubAccount(admin.id)
      ;({ cookie: adminCookie } = await fx.seedSessionCookie(admin.id))

      const owner = await fx.seedUser()
      seededUserIds.push(owner.id)
      ownerId = owner.id
      const repo = await fx.seedRepository(owner.id)
      repoId = repo.id
      const legacyToken = await fx.seedToken(owner.id, { repositoryId: repo.id })
      legacyTokenId = legacyToken.id
      const alert = await fx.seedAlert(legacyToken.id, owner.id)
      legacyAlertId = alert.id
    })

    afterAll(async () => {
      await fx.deleteUsers(seededUserIds)
    })

    it('GET /api/admin/ci-tokens/:legacyId/audit -> 200 on a legacy id', async () => {
      await assertStatus(
        await app.request(`/api/admin/ci-tokens/${legacyTokenId}/audit`, {
          headers: cookieHeaders(adminCookie),
        }),
        200,
        'admin audit on legacy id',
      )
    })

    it('GET /api/admin/ci-tokens/:legacyId/alerts -> 200 on a legacy id', async () => {
      const res = await assertStatus(
        await app.request(`/api/admin/ci-tokens/${legacyTokenId}/alerts`, {
          headers: cookieHeaders(adminCookie),
        }),
        200,
        'admin alerts on legacy id',
      )
      const body = (await res.json()) as { alerts: { id: string }[] }
      expect(body.alerts.map((a) => a.id)).toContain(legacyAlertId)
    })

    it('POST /api/admin/ci-tokens/:legacyId/alerts/:alertId/acknowledge -> 200 on a legacy id', async () => {
      await assertStatus(
        await app.request(
          `/api/admin/ci-tokens/${legacyTokenId}/alerts/${legacyAlertId}/acknowledge`,
          { method: 'POST', headers: cookieHeaders(adminCookie) },
        ),
        200,
        'admin acknowledge on legacy id',
      )
    })

    it('GET /api/admin/ci-tokens/:legacyId/config -> 404 (config is user-level only)', async () => {
      await assertStatus(
        await app.request(`/api/admin/ci-tokens/${legacyTokenId}/config`, {
          headers: cookieHeaders(adminCookie),
        }),
        404,
        'admin config on legacy id',
      )
    })

    it('DELETE /api/admin/ci-tokens/:legacyId (bare) -> 422 with the redirect-to-legacy-route message', async () => {
      const res = await assertStatus(
        await app.request(`/api/admin/ci-tokens/${legacyTokenId}`, {
          method: 'DELETE',
          headers: cookieHeaders(adminCookie),
        }),
        422,
        'admin bare DELETE on legacy id',
      )
      const body = (await res.json()) as { error: string }
      expect(body.error).toMatch(/DELETE \/api\/admin\/ci-tokens\/legacy\/:tokenId/)
    })

    it('DELETE /api/admin/ci-tokens/legacy/:legacyId -> 204 and revokes the token', async () => {
      await assertStatus(
        await app.request(`/api/admin/ci-tokens/legacy/${legacyTokenId}`, {
          method: 'DELETE',
          headers: cookieHeaders(adminCookie),
        }),
        204,
        'admin DELETE legacy/:legacyId',
      )
      const [row] = await db
        .select({ revokedAt: mcpTokens.revokedAt, revokedReason: mcpTokens.revokedReason })
        .from(mcpTokens)
        .where(eq(mcpTokens.id, legacyTokenId))
      expect(row?.revokedAt).not.toBeNull()
      expect(row?.revokedReason).toBe('admin_revoke')
    })

    it('GET /api/admin/ci-tokens/legacy carries owner + repository.deletedAt for the seeded legacy row', async () => {
      const res = await assertStatus(
        await app.request('/api/admin/ci-tokens/legacy', { headers: cookieHeaders(adminCookie) }),
        200,
        'admin legacy list',
      )
      const body = (await res.json()) as {
        tokens: {
          id: string
          owner?: { id: string; name: string; email: string }
          repository: { id: string; name: string; deletedAt?: string | null }
        }[]
      }
      const row = body.tokens.find((t) => t.id === legacyTokenId)
      expect(row).toBeDefined()
      expect(row!.owner).toEqual(
        expect.objectContaining({
          id: ownerId,
          name: expect.any(String),
          email: expect.any(String),
        }),
      )
      expect(row!.repository.id).toBe(repoId)
      expect('deletedAt' in row!.repository).toBe(true)
      expect(row!.repository.deletedAt).toBeNull()
    })
  })
})
