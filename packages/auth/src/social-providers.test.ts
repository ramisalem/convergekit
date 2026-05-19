import { describe, expect, it } from 'vitest'

import { buildAuthSocialProviders } from './social-providers.js'

describe('buildAuthSocialProviders', () => {
  it('always configures GitHub with repository and organization scopes', () => {
    const providers = buildAuthSocialProviders({
      githubClientId: 'github-client',
      githubClientSecret: 'github-secret',
    })

    expect(providers.github).toMatchObject({
      clientId: 'github-client',
      clientSecret: 'github-secret',
      scope: ['read:user', 'user:email', 'repo', 'read:org'],
    })
  })

  it('does not include any Google provider configuration', () => {
    expect(
      JSON.stringify(
        buildAuthSocialProviders({
          githubClientId: 'github-client',
          githubClientSecret: 'github-secret',
        }),
      ),
    ).not.toContain('google')
  })
})
