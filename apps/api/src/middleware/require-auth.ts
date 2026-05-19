import { auth } from '@convergekit/auth'
import { accessPolicyConfig, isAllowedAccessPolicyEmail } from '@convergekit/config/access-policy'
import { account, db, user } from '@convergekit/db'
import { and, eq, isNull } from 'drizzle-orm'
import type { MiddlewareHandler } from 'hono'
import { ForbiddenError, UnauthorizedError } from '../errors.js'
import { verifyGitHubOrganizationAccess } from '../lib/github-access.js'

// Extend Hono context variables with the resolved userId
declare module 'hono' {
  interface ContextVariableMap {
    userId: string
  }
}

/**
 * Protects routes by validating either:
 * 1. A cookie session (browser clients via better-auth)
 * 2. A Bearer token in the Authorization header (API/MCP clients)
 *
 * On success, attaches `userId` to the Hono context.
 * On failure, throws UnauthorizedError (mapped to 401 by onError).
 */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })

  if (!session?.user?.id) {
    throw new UnauthorizedError()
  }

  const [activeUser] = await db
    .select({
      id: user.id,
      email: user.email,
      role: user.role,
      deactivatedAt: user.deactivatedAt,
    })
    .from(user)
    .where(and(eq(user.id, session.user.id), isNull(user.deactivatedAt)))
    .limit(1)

  if (!activeUser) {
    throw new UnauthorizedError('User is deactivated')
  }

  if (!isAllowedAccessPolicyEmail(activeUser.email, accessPolicyConfig)) {
    throw new ForbiddenError(
      `User email must use the configured email domain: ${accessPolicyConfig.allowedEmailDomain}`,
    )
  }

  if (activeUser.role === 'admin') {
    const githubAccount = await db.query.account.findFirst({
      where: and(eq(account.userId, activeUser.id), eq(account.providerId, 'github')),
    })

    if (!githubAccount?.accessToken) {
      throw new UnauthorizedError('Reconnect GitHub to continue as an admin')
    }

    const access = await verifyGitHubOrganizationAccess(githubAccount.accessToken)
    if (!access.allowed) {
      throw new ForbiddenError(
        `Authorize GitHub organization SSO for ${accessPolicyConfig.allowedGitHubOrg}`,
      )
    }
  }

  c.set('userId', session.user.id)
  return next()
}
