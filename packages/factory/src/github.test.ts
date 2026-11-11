import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { createFactoryGitHub, FactoryGitHubError, loadHub } from './github.js'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixture = (name: string) => readFileSync(join(fixtures, name), 'utf8')

function fakeFetch(routes: Record<string, () => Response>) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    const path = url.replace('https://api.github.com', '')
    const route = routes[path]
    return route ? route() : new Response('not found', { status: 404 })
  })
}

describe('createFactoryGitHub', () => {
  it('sends the service token and reads raw file text', async () => {
    const fetch = fakeFetch({
      '/repos/acme/factory-hub/contents/kit/docs/factory/repos.txt': () =>
        new Response('acme/storefront\n'),
    })
    const github = createFactoryGitHub({ token: 'ghp_service', fetch })

    await expect(
      github.getFileText('acme/factory-hub', 'kit/docs/factory/repos.txt'),
    ).resolves.toBe('acme/storefront\n')
    const init = fetch.mock.calls[0][1] as RequestInit
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer ghp_service',
      Accept: 'application/vnd.github.raw+json',
    })
  })

  it('returns null for a missing file and throws on other errors', async () => {
    const github = createFactoryGitHub({
      token: 't',
      fetch: fakeFetch({
        '/repos/acme/hub/contents/broken': () => new Response('', { status: 500 }),
      }),
    })
    await expect(github.getFileText('acme/hub', 'missing')).resolves.toBeNull()
    await expect(github.getFileText('acme/hub', 'broken')).rejects.toBeInstanceOf(
      FactoryGitHubError,
    )
  })

  it('maps collaborator responses: 204 yes, 404 no, anything else throws', async () => {
    const github = createFactoryGitHub({
      token: 't',
      fetch: fakeFetch({
        '/repos/acme/hub/collaborators/member': () => new Response(null, { status: 204 }),
        '/repos/acme/hub/collaborators/limited': () => new Response('', { status: 403 }),
      }),
    })
    await expect(github.isCollaborator('acme/hub', 'member')).resolves.toBe(true)
    await expect(github.isCollaborator('acme/hub', 'stranger')).resolves.toBe(false)
    await expect(github.isCollaborator('acme/hub', 'limited')).rejects.toMatchObject({
      status: 403,
    })
  })

  it('looks up a login by account id', async () => {
    const github = createFactoryGitHub({
      token: 't',
      fetch: fakeFetch({
        '/user/42': () => new Response(JSON.stringify({ login: 'pat-owner' })),
      }),
    })
    await expect(github.getLoginById('42')).resolves.toBe('pat-owner')
    await expect(github.getLoginById('7')).resolves.toBeNull()
  })
})

describe('loadHub', () => {
  it('loads the repo list and each profile, with null for repos that have none', async () => {
    const files: Record<string, string> = {
      'kit/docs/factory/repos.txt': fixture('repos.txt'),
      'profiles/storefront.md': fixture('storefront.md'),
      'profiles/billing_api.md': fixture('billing_api.md'),
    }
    const hub = await loadHub(
      { getFileText: async (_repo, path) => files[path] ?? null },
      'acme/factory-hub',
    )

    expect(hub.hubRepo).toBe('acme/factory-hub')
    expect(hub.repos.map((repo) => [repo.fullName, repo.profile?.product ?? null])).toEqual([
      ['acme/storefront', 'Acme Shop'],
      ['acme-labs/billing_api', 'Acme Shop'],
      ['acme/factory-hub', null],
    ])
  })

  it('fails when the hub has no repo list', async () => {
    await expect(loadHub({ getFileText: async () => null }, 'acme/empty')).rejects.toThrow(
      /has no kit\/docs\/factory\/repos.txt/,
    )
  })
})
