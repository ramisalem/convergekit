import type { FactoryConfig } from '@convergekit/config/factory'
import type { FactoryGitHub } from '@convergekit/factory/github'

/** How long a GitHub login is kept between the profile lookup and the user-create hook. */
export const GITHUB_LOGIN_TTL_MS = 2 * 60 * 1000

export type GitHubLoginMemory = ReturnType<typeof createGitHubLoginMemory>

/**
 * better-auth drops provider-profile fields that are not user columns before the user-create
 * hook runs, so the hook cannot see the GitHub login. The GitHub provider's profile mapper
 * remembers it here, keyed by the email GitHub returned, and the hook takes it back out
 * during the same sign-in.
 */
export function createGitHubLoginMemory(now: () => number = () => Date.now()) {
  const entries = new Map<string, { login: string; expiresAt: number }>()
  const keyOf = (email: string) => email.trim().toLowerCase()

  return {
    remember(email: string, login: string) {
      const time = now()
      for (const [key, entry] of entries) if (entry.expiresAt <= time) entries.delete(key)
      entries.set(keyOf(email), { login, expiresAt: time + GITHUB_LOGIN_TTL_MS })
    },

    take(email: string): string | null {
      const key = keyOf(email)
      const entry = entries.get(key)
      entries.delete(key)
      return entry && entry.expiresAt > now() ? entry.login : null
    },
  }
}

export type FactoryMemberCheck = (user: {
  email?: unknown
  emailVerified?: unknown
}) => Promise<boolean>

/**
 * Whether a first-time GitHub sign-in belongs to a collaborator on the factory access repo.
 * Off unless the factory is enabled with FACTORY_MEMBER_SIGNUP=true. Fails closed: any
 * GitHub error means "not a member", so sign-up stays disabled for that attempt.
 */
export function createFactoryMemberCheck(deps: {
  config: FactoryConfig
  github: Pick<FactoryGitHub, 'isCollaborator'> | null
  logins: GitHubLoginMemory
  warn?: (details: Record<string, unknown>) => void
}): FactoryMemberCheck {
  const { config, github, logins } = deps
  if (!config.enabled || !config.memberSignup || !github) return () => Promise.resolve(false)

  return async ({ email, emailVerified }) => {
    if (typeof email !== 'string' || emailVerified !== true) return false
    const login = logins.take(email)
    if (!login) return false
    try {
      return await github.isCollaborator(config.accessRepo, login)
    } catch (error) {
      deps.warn?.({
        event: 'factory_member_signup_check_failed',
        login,
        accessRepo: config.accessRepo,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }
}

export type FactoryMemberGroups = ReturnType<typeof createFactoryMemberGroups>

/**
 * Puts members created by member sign-up into the group named by FACTORY_MEMBER_GROUP, so
 * they see the repositories the admin assigned to that group. better-auth only stores user
 * columns it knows, so the group cannot be set while creating the user: the create hook marks
 * the new member by email, and the after-create hook sets the group once the user exists.
 * A missing group or a database error leaves the member without a group (they see no
 * repositories until an admin assigns one) and is reported through `warn`.
 */
export function createFactoryMemberGroups(deps: {
  config: FactoryConfig
  findGroupId(name: string): Promise<string | null>
  setUserGroup(userId: string, groupId: string): Promise<void>
  warn?: (details: Record<string, unknown>) => void
  now?: () => number
}) {
  const groupName = deps.config.enabled && deps.config.memberSignup ? deps.config.memberGroup : null
  const newMembers = createGitHubLoginMemory(deps.now)

  return {
    /** Call from the create hook when the user being created is a factory member. */
    markNewMember(email: string) {
      if (groupName) newMembers.remember(email, groupName)
    },

    /** Call from the after-create hook with the stored user. */
    async onUserCreated(user: { id?: unknown; email?: unknown }) {
      if (typeof user.id !== 'string' || typeof user.email !== 'string') return
      const name = newMembers.take(user.email)
      if (!name) return
      try {
        const groupId = await deps.findGroupId(name)
        if (!groupId) {
          deps.warn?.({ event: 'factory_member_group_missing', group: name })
          return
        }
        await deps.setUserGroup(user.id, groupId)
      } catch (error) {
        deps.warn?.({
          event: 'factory_member_group_failed',
          group: name,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  }
}
