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
