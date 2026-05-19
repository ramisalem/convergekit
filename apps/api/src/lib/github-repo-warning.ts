export type GitHubRepoVisibilitySummary = {
  hasReadOrgScope: boolean
  orgDiscoveryFailed: boolean
  organizationCount: number | null
  organizationRepoCount: number
  userRepoOrganizationCount: number
}

export function buildGitHubRepoWarning(summary: GitHubRepoVisibilitySummary): string | null {
  if (!summary.hasReadOrgScope) {
    return 'Reconnect GitHub to grant organization access and load org repositories.'
  }

  if (summary.orgDiscoveryFailed) {
    return 'GitHub organization repositories could not be loaded. Reconnect GitHub and confirm the organization has approved the ConvergeKit OAuth app.'
  }

  const organizationReposVisible =
    summary.organizationRepoCount > 0 || summary.userRepoOrganizationCount > 0

  if (summary.organizationCount === 0 && !organizationReposVisible) {
    return 'GitHub returned only personal repositories. If you expected organization repositories, ask an organization owner to approve the ConvergeKit OAuth app, then reconnect GitHub.'
  }

  return null
}
