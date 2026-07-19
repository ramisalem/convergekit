import { closeDbConnection, db, mcpOauthToken, mcpTokens, user } from '@convergekit/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deactivateUsers, disableCapability, revokeAllForUser } from '../lib/user-mutations.js'
import { makeFixture } from './support.js'

// Real-Postgres integration suite (Task 15b, file 2 of 3): atomicity
// (beforeCommit-throw rollbacks), the group-change + capability-disable
// composition mirroring the PUT /api/users/:id handler, and the OAuth-grant
// boundary between revokeAllForUser and deactivateUsers. Direct function
// invocation throughout — hooks cannot traverse HTTP.
//
// Connects to the SHARED local dev database via DATABASE_URL. Every seed is
// tagged `it-15b-atomicity-*` and torn down by exact id.

const fx = makeFixture('atomicity')
const boom = {
  beforeCommit: async () => {
    throw new Error('simulated beforeCommit failure')
  },
}

async function ciTokensEnabledFor(userId: string): Promise<boolean | undefined> {
  const [row] = await db
    .select({ ciTokensEnabled: user.ciTokensEnabled })
    .from(user)
    .where(eq(user.id, userId))
  return row?.ciTokensEnabled
}

async function tokenRevokedAt(tokenId: string): Promise<Date | null | undefined> {
  const [row] = await db
    .select({ revokedAt: mcpTokens.revokedAt })
    .from(mcpTokens)
    .where(eq(mcpTokens.id, tokenId))
  return row?.revokedAt
}

async function grantRevokedAt(grantId: string): Promise<Date | null | undefined> {
  const [row] = await db
    .select({ revokedAt: mcpOauthToken.revokedAt })
    .from(mcpOauthToken)
    .where(eq(mcpOauthToken.id, grantId))
  return row?.revokedAt
}

describe('ci-token atomicity: beforeCommit rollbacks (real Postgres)', () => {
  const seededUserIds: string[] = []

  beforeAll(async () => {
    await fx.sweepLeftovers()
  })

  afterAll(async () => {
    await fx.deleteUsers(seededUserIds)
  })

  it('disableCapability: a beforeCommit throw rolls back BOTH the flag flip and the token revoke', async () => {
    const owner = await fx.seedUser({ ciTokensEnabled: true })
    seededUserIds.push(owner.id)
    const token = await fx.seedToken(owner.id)

    await expect(db.transaction((tx) => disableCapability(tx, [owner.id], boom))).rejects.toThrow(
      'simulated beforeCommit failure',
    )

    expect(await ciTokensEnabledFor(owner.id)).toBe(true)
    expect(await tokenRevokedAt(token.id)).toBeNull()
  }, 15000)

  it('deactivateUsers: a beforeCommit throw rolls back the deactivation, the token revoke, AND the OAuth grant revoke', async () => {
    const owner = await fx.seedUser()
    seededUserIds.push(owner.id)
    const token = await fx.seedToken(owner.id)
    const grant = await fx.seedOAuthGrant(owner.id)

    await expect(db.transaction((tx) => deactivateUsers(tx, [owner.id], boom))).rejects.toThrow(
      'simulated beforeCommit failure',
    )

    const [refreshed] = await db
      .select({ deactivatedAt: user.deactivatedAt })
      .from(user)
      .where(eq(user.id, owner.id))
    expect(refreshed?.deactivatedAt).toBeNull()
    expect(await tokenRevokedAt(token.id)).toBeNull()
    expect(await grantRevokedAt(grant.id)).toBeNull()
  }, 15000)

  it('revokeAllForUser: a beforeCommit throw rolls back BOTH the flag flip and the token revoke', async () => {
    const owner = await fx.seedUser({ ciTokensEnabled: true })
    seededUserIds.push(owner.id)
    const token = await fx.seedToken(owner.id)

    await expect(db.transaction((tx) => revokeAllForUser(tx, owner.id, boom))).rejects.toThrow(
      'simulated beforeCommit failure',
    )

    expect(await ciTokensEnabledFor(owner.id)).toBe(true)
    expect(await tokenRevokedAt(token.id)).toBeNull()
  }, 15000)
})

describe('ci-token atomicity: group-change + capability-disable composition (real Postgres)', () => {
  const seededUserIds: string[] = []
  const seededGroupIds: string[] = []

  beforeAll(async () => {
    await fx.sweepLeftovers()
  })

  afterAll(async () => {
    await fx.deleteUsers(seededUserIds)
    await fx.deleteGroups(seededGroupIds)
  })

  // Mirrors PUT /api/users/:id: the groupId write and disableCapability run in
  // ONE transaction, so disableCapability's in-tx revoke sweep
  // (revokeMcpTokensNoLongerAllowed -> scopedRepositoryIds) sees the ALREADY
  // WRITTEN new groupId, not the pre-request one.
  async function seedGroupChangeScenario() {
    const groupA = await fx.seedGroup()
    const groupB = await fx.seedGroup()
    seededGroupIds.push(groupA.id, groupB.id)

    const owner = await fx.seedUser({ ciTokensEnabled: true, groupId: groupA.id })
    seededUserIds.push(owner.id)

    // Repository reachable ONLY via group A.
    const repo = await fx.seedRepository(owner.id)
    await fx.seedGroupRepository(groupA.id, repo.id)

    const legacyToken = await fx.seedToken(owner.id, { repositoryId: repo.id })
    const userLevelToken = await fx.seedToken(owner.id)

    return { groupA, groupB, owner, repo, legacyToken, userLevelToken }
  }

  it('moving the user to a group with no access to their legacy repo, composed with disableCapability, revokes BOTH the legacy row and the user-level row', async () => {
    const { groupB, owner, legacyToken, userLevelToken } = await seedGroupChangeScenario()

    await db.transaction(async (tx) => {
      await tx.update(user).set({ groupId: groupB.id }).where(eq(user.id, owner.id))
      await disableCapability(tx, [owner.id])
    })

    expect(await tokenRevokedAt(legacyToken.id)).not.toBeNull()
    expect(await tokenRevokedAt(userLevelToken.id)).not.toBeNull()

    const [refreshed] = await db
      .select({ groupId: user.groupId, ciTokensEnabled: user.ciTokensEnabled })
      .from(user)
      .where(eq(user.id, owner.id))
    expect(refreshed?.groupId).toBe(groupB.id)
    expect(refreshed?.ciTokensEnabled).toBe(false)
  }, 15000)

  it('a beforeCommit throw in the SAME composition reverts BOTH the groupId write and all revokes', async () => {
    const { groupA, groupB, owner, legacyToken, userLevelToken } = await seedGroupChangeScenario()

    await expect(
      db.transaction(async (tx) => {
        await tx.update(user).set({ groupId: groupB.id }).where(eq(user.id, owner.id))
        await disableCapability(tx, [owner.id], boom)
      }),
    ).rejects.toThrow('simulated beforeCommit failure')

    expect(await tokenRevokedAt(legacyToken.id)).toBeNull()
    expect(await tokenRevokedAt(userLevelToken.id)).toBeNull()

    const [refreshed] = await db
      .select({ groupId: user.groupId, ciTokensEnabled: user.ciTokensEnabled })
      .from(user)
      .where(eq(user.id, owner.id))
    expect(refreshed?.groupId).toBe(groupA.id)
    expect(refreshed?.ciTokensEnabled).toBe(true)
  }, 15000)
})

describe('ci-token atomicity: OAuth-grant boundary (real Postgres)', () => {
  const seededUserIds: string[] = []

  beforeAll(async () => {
    await fx.sweepLeftovers()
  })

  afterAll(async () => {
    await fx.deleteUsers(seededUserIds)
  })

  it('revokeAllForUser leaves OAuth grants untouched (static-only kill-switch)', async () => {
    const owner = await fx.seedUser({ ciTokensEnabled: true })
    seededUserIds.push(owner.id)
    const grant = await fx.seedOAuthGrant(owner.id)

    await db.transaction((tx) => revokeAllForUser(tx, owner.id))

    expect(await grantRevokedAt(grant.id)).toBeNull()
  }, 15000)

  it('single deactivateUsers revokes the OAuth grant', async () => {
    const owner = await fx.seedUser()
    seededUserIds.push(owner.id)
    const grant = await fx.seedOAuthGrant(owner.id)

    await db.transaction((tx) => deactivateUsers(tx, [owner.id]))

    expect(await grantRevokedAt(grant.id)).not.toBeNull()
  }, 15000)

  it('bulk deactivateUsers revokes the OAuth grant for every included user', async () => {
    const owner = await fx.seedUser()
    const pad = await fx.seedUser()
    seededUserIds.push(owner.id, pad.id)
    const grant = await fx.seedOAuthGrant(owner.id)
    const padGrant = await fx.seedOAuthGrant(pad.id)

    await db.transaction((tx) => deactivateUsers(tx, [owner.id, pad.id]))

    expect(await grantRevokedAt(grant.id)).not.toBeNull()
    expect(await grantRevokedAt(padGrant.id)).not.toBeNull()
  }, 15000)
})

// File-level: close the shared `db` connection exactly ONCE, after every
// describe block in this file has finished — see the identical note in
// ci-token-races.integration.test.ts.
afterAll(async () => {
  await closeDbConnection()
})
