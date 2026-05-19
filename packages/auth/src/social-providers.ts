import type { betterAuth } from 'better-auth'

type AuthSocialProviders = Parameters<typeof betterAuth>[0]['socialProviders']

export type BuildAuthSocialProvidersInput = {
  githubClientId: string
  githubClientSecret: string
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
    },
  }
}
