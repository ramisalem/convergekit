import type { betterAuth } from 'better-auth'

type AuthSocialProviders = Parameters<typeof betterAuth>[0]['socialProviders']

export type BuildAuthSocialProvidersInput = {
  githubClientId: string
  githubClientSecret: string
  /** Called with every GitHub profile at sign-in, e.g. to remember the login for later hooks. */
  onGitHubProfile?: (profile: { login: string; email: string | null }) => void
}

export function buildAuthSocialProviders(
  input: BuildAuthSocialProvidersInput,
): AuthSocialProviders {
  return {
    github: {
      clientId: input.githubClientId,
      clientSecret: input.githubClientSecret,
      // 'repo' grants read/write access to public and private repositories,
      // and 'read:org' is needed to enumerate organization memberships/repos.
      scope: ['read:user', 'user:email', 'repo', 'read:org'],
      mapProfileToUser: (profile) => {
        input.onGitHubProfile?.({ login: profile.login, email: profile.email ?? null })
        return {}
      },
    },
  }
}
