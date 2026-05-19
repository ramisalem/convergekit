import { accessPolicyConfig, type AccessPolicyConfig } from '@convergekit/config/access-policy'

export type GitHubOrgAccessResult = {
  allowed: boolean
  reason: null | 'sso_required' | 'membership_inactive' | 'github_error'
}

export type GitHubApiRepo = {
  name: string
  full_name: string
  clone_url: string
  private: boolean
  default_branch: string
  description: string | null
  updated_at: string
}

export type AllowedGitHubRepository = {
  name: string
  fullName: string
  cloneUrl: string
  isPrivate: boolean
  defaultBranch: string
  description: string | null
  updatedAt: string
}

export function getGitHubHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function getNextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null

  for (const part of linkHeader.split(',')) {
    const [rawUrl, rel] = part.split(';').map((value) => value.trim())
    if (rel !== 'rel="next"') continue
    return rawUrl.replace(/^<|>$/g, '')
  }

  return null
}

export async function fetchGitHubPages<T>(url: string, accessToken: string): Promise<T[]> {
  const results: T[] = []
  let nextUrl: string | null = url

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: getGitHubHeaders(accessToken),
    })

    if (!response.ok) {
      throw new Error(`GitHub request failed with status ${response.status}`)
    }

    const page = (await response.json()) as T[]
    results.push(...page)
    nextUrl = getNextPageUrl(response.headers.get('link'))
  }

  return results
}

export async function verifyGitHubOrganizationAccess(
  accessToken: string,
  config: AccessPolicyConfig = accessPolicyConfig,
): Promise<GitHubOrgAccessResult> {
  if (!config.allowedGitHubOrg) {
    return { allowed: true, reason: null }
  }

  const response = await fetch(
    `https://api.github.com/user/memberships/orgs/${encodeURIComponent(config.allowedGitHubOrg)}`,
    { headers: getGitHubHeaders(accessToken) },
  )

  if (!response.ok) {
    return {
      allowed: false,
      reason: response.headers.get('x-github-sso') ? 'sso_required' : 'github_error',
    }
  }

  const body = (await response.json()) as { state?: string }
  if (body.state !== 'active') {
    return { allowed: false, reason: 'membership_inactive' }
  }

  return { allowed: true, reason: null }
}

export async function fetchAllowedGitHubRepositories(
  accessToken: string,
  config: AccessPolicyConfig = accessPolicyConfig,
): Promise<AllowedGitHubRepository[]> {
  const url = config.allowedGitHubOrg
    ? `https://api.github.com/orgs/${encodeURIComponent(config.allowedGitHubOrg)}/repos?per_page=100&type=all&sort=updated`
    : 'https://api.github.com/user/repos?per_page=100&type=all&sort=updated'
  const repos = await fetchGitHubPages<GitHubApiRepo>(
    url,
    accessToken,
  )

  return repos.map((repo) => ({
    name: repo.name,
    fullName: repo.full_name,
    cloneUrl: repo.clone_url,
    isPrivate: repo.private,
    defaultBranch: repo.default_branch,
    description: repo.description,
    updatedAt: repo.updated_at,
  }))
}

export async function verifyGitHubRepositoryVisible(
  accessToken: string,
  owner: string,
  name: string,
): Promise<boolean> {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    { headers: getGitHubHeaders(accessToken) },
  )
  return response.ok
}
