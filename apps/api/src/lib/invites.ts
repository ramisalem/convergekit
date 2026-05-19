import { isAllowedAccessPolicyEmail } from '@convergekit/config/access-policy'
import { account, db, user, userInvitations } from '@convergekit/db'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { createHash, randomBytes } from 'node:crypto'
import { hashPassword } from './password.js'

const TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:4000'

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export function buildInviteUrl(rawToken: string): string {
  return `${webAppUrl}/auth/accept-invite?token=${rawToken}`
}

/**
 * Invalidates any prior unused invites for the user, then issues a new one.
 * Returns the raw token (caller must reveal it to the admin once — it is never stored).
 */
export async function issueInviteToken(params: {
  userId: string
  createdBy: string | null
}): Promise<{ rawToken: string; expiresAt: Date }> {
  const now = new Date()

  await db
    .update(userInvitations)
    .set({ usedAt: now })
    .where(and(eq(userInvitations.userId, params.userId), isNull(userInvitations.usedAt)))

  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = sha256Hex(rawToken)
  const expiresAt = new Date(now.getTime() + TOKEN_LIFETIME_MS)

  await db.insert(userInvitations).values({
    id: nanoid(),
    userId: params.userId,
    tokenHash,
    expiresAt,
    createdBy: params.createdBy,
    createdAt: now,
  })

  return { rawToken, expiresAt }
}

/**
 * Looks up an invitation by raw token. Returns { email, hasPassword } when
 * the token is valid and unused. Returns null otherwise.
 */
export async function verifyInviteToken(rawToken: string): Promise<{
  userId: string
  email: string
  hasPassword: boolean
} | null> {
  if (!rawToken || rawToken.length !== 64) return null
  const tokenHash = sha256Hex(rawToken)
  const now = new Date()

  const [row] = await db
    .select({
      userId: userInvitations.userId,
      email: user.email,
    })
    .from(userInvitations)
    .innerJoin(user, eq(userInvitations.userId, user.id))
    .where(
      and(
        eq(userInvitations.tokenHash, tokenHash),
        isNull(userInvitations.usedAt),
        gt(userInvitations.expiresAt, now),
      ),
    )
    .limit(1)

  if (!row) return null
  if (!isAllowedAccessPolicyEmail(row.email)) return null

  const [existingCredential] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, row.userId), eq(account.providerId, 'credential')))
    .limit(1)

  return { userId: row.userId, email: row.email, hasPassword: !!existingCredential }
}

/**
 * Consumes an invite: sets the user's credential-account password (inserting
 * the account row if missing), marks the invitation used, and marks email verified.
 * Returns true on success, false if the token is invalid or already used.
 */
export async function consumeInviteToken(rawToken: string, newPassword: string): Promise<boolean> {
  if (!rawToken || rawToken.length !== 64) return false
  const tokenHash = sha256Hex(rawToken)
  const now = new Date()

  const [row] = await db
    .select({ id: userInvitations.id, userId: userInvitations.userId, email: user.email })
    .from(userInvitations)
    .innerJoin(user, eq(userInvitations.userId, user.id))
    .where(
      and(
        eq(userInvitations.tokenHash, tokenHash),
        isNull(userInvitations.usedAt),
        gt(userInvitations.expiresAt, now),
      ),
    )
    .limit(1)

  if (!row) return false
  if (!isAllowedAccessPolicyEmail(row.email)) return false

  const hashed = await hashPassword(newPassword)

  const [existing] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, row.userId), eq(account.providerId, 'credential')))
    .limit(1)

  if (existing) {
    await db
      .update(account)
      .set({ password: hashed, updatedAt: now })
      .where(eq(account.id, existing.id))
  } else {
    await db.insert(account).values({
      id: nanoid(),
      accountId: row.userId,
      providerId: 'credential',
      userId: row.userId,
      password: hashed,
      createdAt: now,
      updatedAt: now,
    })
  }

  await db.update(userInvitations).set({ usedAt: now }).where(eq(userInvitations.id, row.id))

  await db.update(user).set({ emailVerified: true, updatedAt: now }).where(eq(user.id, row.userId))

  return true
}
