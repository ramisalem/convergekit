import { describe, expect, it } from 'vitest'
import { buildGitHubRepoWarning } from './github-repo-warning.js'

describe('buildGitHubRepoWarning', () => {
  it('asks users to reconnect when the GitHub token is missing organization scope', () => {
    expect(
      buildGitHubRepoWarning({
        hasReadOrgScope: false,
        orgDiscoveryFailed: false,
        organizationCount: null,
        organizationRepoCount: 0,
        userRepoOrganizationCount: 0,
      }),
    ).toBe('Reconnect GitHub to grant organization access and load org repositories.')
  })

  it('explains GitHub organization OAuth restrictions when scopes exist but no org repos are visible', () => {
    expect(
      buildGitHubRepoWarning({
        hasReadOrgScope: true,
        orgDiscoveryFailed: false,
        organizationCount: 0,
        organizationRepoCount: 0,
        userRepoOrganizationCount: 0,
      }),
    ).toBe(
      'GitHub returned only personal repositories. If you expected organization repositories, ask an organization owner to approve the Colab Ai Hub OAuth app, then reconnect GitHub.',
    )
  })

  it('does not warn when organization repositories are visible', () => {
    expect(
      buildGitHubRepoWarning({
        hasReadOrgScope: true,
        orgDiscoveryFailed: false,
        organizationCount: 1,
        organizationRepoCount: 3,
        userRepoOrganizationCount: 0,
      }),
    ).toBeNull()
  })
})
