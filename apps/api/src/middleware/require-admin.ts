import { eq } from 'drizzle-orm'
import type { MiddlewareHandler } from 'hono'
import { db, user } from '@convergekit/db'
import { ForbiddenError } from '../errors.js'

declare module 'hono' {
  interface ContextVariableMap {
    userRole: 'admin' | 'user'
  }
}

/**
 * Requires the authenticated user to have `role = 'admin'`.
 * Always fetches fresh from DB — never relies on cached session data.
 * Must be used AFTER requireAuth (needs `userId` in context).
 */
export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const userId = c.get('userId')

  const dbUser = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  const role = dbUser[0]?.role
  if (role !== 'admin') {
    throw new ForbiddenError()
  }

  c.set('userRole', role)
  return next()
}
