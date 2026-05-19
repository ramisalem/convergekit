import {
  assertAllowedAccessPolicyEmail,
  normalizeAccessPolicyEmail,
} from '@convergekit/config/access-policy'
import { account, db, user, userInvitations } from '@convergekit/db'
import { and, eq, gt, inArray, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { NotFoundError, ValidationError } from '../errors.js'
import { buildInviteUrl, issueInviteToken } from '../lib/invites.js'
import {
  deleteSessionsForUser,
  revokeActiveMcpTokensForUser,
  revokeActiveMcpTokensForUsers,
  revokeMcpTokensNoLongerAllowed,
} from '../lib/mcp-token-security.js'

export const userManagementRoutes = new Hono()

const inviteUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().transform(normalizeAccessPolicyEmail),
  role: z.enum(['admin', 'user']).default('user'),
  groupId: z.string().optional(),
})

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  groupId: z.string().nullable().optional(),
  role: z.enum(['admin', 'user']).optional(),
})

const bulkUpdateSchema = z.object({
  userIds: z.array(z.string()).min(1).max(100),
  groupId: z.string().nullable().optional(),
  role: z.enum(['admin', 'user']).optional(),
  deactivated: z.boolean().optional(),
})

function assertUserEmailAllowed(email: string): void {
  try {
    assertAllowedAccessPolicyEmail(email)
  } catch (error) {
    throw new ValidationError(
      error instanceof Error ? error.message : 'Email domain is not allowed',
    )
  }
}

async function assertTargetUserAllowed(id: string) {
  const [target] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.id, id))
    .limit(1)

  if (!target) throw new NotFoundError('User')
  assertUserEmailAllowed(target.email)
  return target
}

// GET /api/users — list with pendingInvite flag
userManagementRoutes.get('/', async (c) => {
  const now = new Date()

  const usersWithInvites = await db
    .selectDistinct({ userId: userInvitations.userId })
    .from(userInvitations)
    .where(and(isNull(userInvitations.usedAt), gt(userInvitations.expiresAt, now)))

  const invitedIds = new Set(usersWithInvites.map((r) => r.userId))

  const usersWithCredential = await db
    .selectDistinct({ userId: account.userId })
    .from(account)
    .where(eq(account.providerId, 'credential'))

  const credentialIds = new Set(usersWithCredential.map((r) => r.userId))

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      groupId: user.groupId,
      deactivatedAt: user.deactivatedAt,
      createdAt: user.createdAt,
    })
    .from(user)

  const users = rows.map((u) => ({
    ...u,
    pendingInvite: invitedIds.has(u.id) && !credentialIds.has(u.id),
  }))

  return c.json({ users })
})

// POST /api/users — invite a new user (returns inviteUrl once)
userManagementRoutes.post('/', async (c) => {
  const requestingUserId = c.get('userId')
  const body = inviteUserSchema.parse(await c.req.json())

  assertUserEmailAllowed(body.email)

  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, body.email))
    .limit(1)
  if (existing) {
    return c.json({ error: 'A user with this email already exists' }, 409)
  }

  const userId = nanoid()
  const now = new Date()
  const [created] = await db
    .insert(user)
    .values({
      id: userId,
      name: body.name,
      email: body.email,
      emailVerified: false,
      role: body.role,
      groupId: body.groupId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  const { rawToken } = await issueInviteToken({ userId, createdBy: requestingUserId })
  const inviteUrl = buildInviteUrl(rawToken)

  return c.json({ user: created, inviteUrl }, 201)
})

// PATCH /api/users/bulk — bulk update groupId and/or role
// NOTE: Must be registered before /:id routes so Hono matches /bulk literally.
userManagementRoutes.patch('/bulk', async (c) => {
  const requestingUserId = c.get('userId')
  const body = bulkUpdateSchema.parse(await c.req.json())

  if (body.role === undefined && body.groupId === undefined && body.deactivated === undefined) {
    return c.json({ error: 'Provide role, groupId, and/or deactivated to update' }, 400)
  }

  if (body.role === 'user' && body.userIds.includes(requestingUserId)) {
    return c.json({ error: 'Cannot change your own admin role' }, 400)
  }

  if (body.deactivated === true && body.userIds.includes(requestingUserId)) {
    return c.json({ error: 'Cannot deactivate your own account' }, 400)
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (body.role !== undefined) patch.role = body.role
  if (body.groupId !== undefined) patch.groupId = body.groupId
  if (body.deactivated !== undefined) patch.deactivatedAt = body.deactivated ? new Date() : null

  const updated = await db
    .update(user)
    .set(patch)
    .where(inArray(user.id, body.userIds))
    .returning({ id: user.id })

  const updatedIds = updated.map((u) => u.id)
  if (body.deactivated === true) {
    await revokeActiveMcpTokensForUsers(updatedIds, 'user_deactivated')
    await Promise.all(updatedIds.map((id) => deleteSessionsForUser(id)))
  } else if (body.role !== undefined || body.groupId !== undefined || body.deactivated === false) {
    await revokeMcpTokensNoLongerAllowed(updatedIds, 'access_changed')
  }

  return c.json({ updated: updatedIds })
})

// GET /api/users/:id
userManagementRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const dbUser = await db.query.user.findFirst({ where: eq(user.id, id) })
  if (!dbUser) throw new NotFoundError('User')
  return c.json({ user: dbUser })
})

// PUT /api/users/:id — update name / role / groupId
userManagementRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  const requestingUserId = c.get('userId')
  const body = updateUserSchema.parse(await c.req.json())

  if (id === requestingUserId && body.role === 'user') {
    return c.json({ error: 'Cannot change your own admin role' }, 400)
  }

  const [updated] = await db
    .update(user)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(user.id, id))
    .returning()

  if (!updated) throw new NotFoundError('User')
  if (body.role !== undefined || body.groupId !== undefined) {
    await revokeMcpTokensNoLongerAllowed([id], 'access_changed')
  }
  return c.json({ user: updated })
})

// POST /api/users/:id/mcp-tokens/revoke-all — admin emergency revocation
userManagementRoutes.post('/:id/mcp-tokens/revoke-all', async (c) => {
  const id = c.req.param('id')

  const [target] = await db.select({ id: user.id }).from(user).where(eq(user.id, id)).limit(1)
  if (!target) throw new NotFoundError('User')

  const revoked = await revokeActiveMcpTokensForUser(id, 'admin_user_revoke_all')
  return c.json({ revoked })
})

// POST /api/users/:id/deactivate — disable sign-in and revoke MCP access
userManagementRoutes.post('/:id/deactivate', async (c) => {
  const id = c.req.param('id')
  const requestingUserId = c.get('userId')

  if (id === requestingUserId) {
    return c.json({ error: 'Cannot deactivate your own account' }, 400)
  }

  const [updated] = await db
    .update(user)
    .set({ deactivatedAt: new Date(), updatedAt: new Date() })
    .where(eq(user.id, id))
    .returning()

  if (!updated) throw new NotFoundError('User')
  await deleteSessionsForUser(id)
  const revoked = await revokeActiveMcpTokensForUser(id, 'user_deactivated')
  return c.json({ user: updated, revoked })
})

// POST /api/users/:id/reactivate
userManagementRoutes.post('/:id/reactivate', async (c) => {
  const id = c.req.param('id')

  const [updated] = await db
    .update(user)
    .set({ deactivatedAt: null, updatedAt: new Date() })
    .where(eq(user.id, id))
    .returning()

  if (!updated) throw new NotFoundError('User')
  return c.json({ user: updated })
})

// POST /api/users/:id/resend-invite — issue a fresh invite token
userManagementRoutes.post('/:id/resend-invite', async (c) => {
  const id = c.req.param('id')
  const requestingUserId = c.get('userId')

  await assertTargetUserAllowed(id)

  const { rawToken } = await issueInviteToken({ userId: id, createdBy: requestingUserId })
  return c.json({ inviteUrl: buildInviteUrl(rawToken) })
})

// POST /api/users/:id/reset-password — same mechanic, different verb
userManagementRoutes.post('/:id/reset-password', async (c) => {
  const id = c.req.param('id')
  const requestingUserId = c.get('userId')

  await assertTargetUserAllowed(id)

  const { rawToken } = await issueInviteToken({ userId: id, createdBy: requestingUserId })
  return c.json({ resetUrl: buildInviteUrl(rawToken) })
})

// DELETE /api/users/:id
userManagementRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const requestingUserId = c.get('userId')

  if (id === requestingUserId) {
    return c.json({ error: 'Cannot delete your own account' }, 400)
  }

  const [deleted] = await db.delete(user).where(eq(user.id, id)).returning()
  if (!deleted) throw new NotFoundError('User')
  return c.body(null, 204)
})
