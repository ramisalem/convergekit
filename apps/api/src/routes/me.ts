import { accessPolicyConfig } from '@convergekit/config/access-policy'
import { resolveWorkforceSsoConfig } from '@convergekit/config/workforce-sso'
import { db, user } from '@convergekit/db'
import { and, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { buildSupportContacts } from '../lib/support-contacts.js'

export const meRoutes = new Hono()
const workforceSsoConfig = resolveWorkforceSsoConfig(process.env, accessPolicyConfig)

/**
 * GET /api/me
 * Returns the current user's profile with role, fetched fresh from DB.
 */
meRoutes.get('/', async (c) => {
  const userId = c.get('userId')

  const dbUser = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      groupId: user.groupId,
      ciTokensEnabled: user.ciTokensEnabled,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  if (!dbUser[0]) return c.json({ error: 'User not found' }, 404)

  const activeAdmins = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    // TODO: cache the active-admin support contact list if this per-request lookup becomes noisy.
    .where(and(eq(user.role, 'admin'), isNull(user.deactivatedAt)))

  return c.json({
    user: dbUser[0],
    supportContacts: buildSupportContacts({
      activeAdmins,
      fallbackEmails: workforceSsoConfig.supportAdminEmails,
      accessPolicy: accessPolicyConfig,
    }),
  })
})
