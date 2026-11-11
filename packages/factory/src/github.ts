import { HUB_PATHS, profilePathFor } from './conventions.js'
import { parseProfile, parseRepoList, type FactoryProfile } from './hub.js'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export class FactoryGitHubError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'FactoryGitHubError'
  }
}

export type FactoryGitHub = ReturnType<typeof createFactoryGitHub>

/** A small GitHub REST client that uses the factory's service token. */
export function createFactoryGitHub(options: {
  token: string
  fetch?: FetchLike
  apiUrl?: string
}) {
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => fetch(input, init))
  const apiUrl = options.apiUrl ?? 'https://api.github.com'

  async function request(path: string, accept = 'application/vnd.github+json') {
    return fetchImpl(`${apiUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: accept,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'convergekit-factory',
      },
    })
  }

  function repoPath(fullName: string) {
    const [owner, name] = fullName.split('/')
    return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
  }

  return {
    /** A file's text on the default branch, or null when it does not exist. */
    async getFileText(fullName: string, path: string): Promise<string | null> {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/')
      const response = await request(
        `${repoPath(fullName)}/contents/${encodedPath}`,
        'application/vnd.github.raw+json',
      )
      if (response.status === 404) return null
      if (!response.ok) {
        throw new FactoryGitHubError(response.status, `Reading ${fullName}/${path} failed`)
      }
      return response.text()
    },

    /** The current login for a numeric GitHub account id (logins can be renamed; ids cannot). */
    async getLoginById(accountId: string): Promise<string | null> {
      const response = await request(`/user/${encodeURIComponent(accountId)}`)
      if (response.status === 404) return null
      if (!response.ok) {
        throw new FactoryGitHubError(
          response.status,
          `Looking up GitHub account ${accountId} failed`,
        )
      }
      const body = (await response.json()) as { login?: string }
      return body.login ?? null
    },

    /** Whether `login` is a collaborator on the repo (direct, via a team, or as an org owner). */
    async isCollaborator(fullName: string, login: string): Promise<boolean> {
      const response = await request(
        `${repoPath(fullName)}/collaborators/${encodeURIComponent(login)}`,
      )
      if (response.status === 204) return true
      if (response.status === 404) return false
      throw new FactoryGitHubError(
        response.status,
        `Checking collaborator ${login} on ${fullName} failed`,
      )
    },
  }
}

export type FactoryHubRepo = {
  fullName: string
  profile: FactoryProfile | null
}

export type FactoryHub = {
  hubRepo: string
  repos: FactoryHubRepo[]
}

/** Read the repo list and every repo's profile from the hub. */
export async function loadHub(
  github: Pick<FactoryGitHub, 'getFileText'>,
  hubRepo: string,
): Promise<FactoryHub> {
  const listText = await github.getFileText(hubRepo, HUB_PATHS.repoList)
  if (listText === null) {
    throw new FactoryGitHubError(404, `${hubRepo} has no ${HUB_PATHS.repoList}`)
  }

  const repos = await Promise.all(
    parseRepoList(listText).map(async (fullName) => {
      const text = await github.getFileText(hubRepo, profilePathFor(fullName))
      return { fullName, profile: text === null ? null : parseProfile(text) }
    }),
  )

  return { hubRepo, repos }
}
