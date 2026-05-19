import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchAllowedGitHubRepositories,
  verifyGitHubOrganizationAccess,
  verifyGitHubRepositoryVisible,
} from './github-access.js'

const fetchMock = vi.fn()
const exampleOrgPolicy = {
  allowedEmailDomain: null,
  allowedGitHubOrg: 'example-org',
  allowedRepositoryHost: 'github.com',
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('verifyGitHubOrganizationAccess', () => {
  it('allows active membership in the configured organization', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ state: 'active' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(verifyGitHubOrganizationAccess('gho_token', exampleOrgPolicy)).resolves.toEqual({
      allowed: true,
      reason: null,
    })
  })

  it('fails closed for SSO authorization failures', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ message: 'Resource protected by organization SAML enforcement' }),
        {
          status: 403,
          headers: { 'X-GitHub-SSO': 'required; url=https://github.com/orgs/example-org/sso' },
        },
      ),
    )

    await expect(verifyGitHubOrganizationAccess('gho_token', exampleOrgPolicy)).resolves.toEqual({
      allowed: false,
      reason: 'sso_required',
    })
  })

  it('fails closed for inactive membership', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ state: 'pending' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(verifyGitHubOrganizationAccess('gho_token', exampleOrgPolicy)).resolves.toEqual({
      allowed: false,
      reason: 'membership_inactive',
    })
  })
})

describe('fetchAllowedGitHubRepositories', () => {
  it('loads only repositories from the configured organization', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            name: 'example-backend',
            full_name: 'example-org/example-backend',
            clone_url: 'https://github.com/example-org/example-backend.git',
            private: true,
            default_branch: 'main',
            description: 'Backend',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await expect(fetchAllowedGitHubRepositories('gho_token', exampleOrgPolicy)).resolves.toEqual([
      {
        name: 'example-backend',
        fullName: 'example-org/example-backend',
        cloneUrl: 'https://github.com/example-org/example-backend.git',
        isPrivate: true,
        defaultBranch: 'main',
        description: 'Backend',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ])

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/orgs/example-org/repos?per_page=100&type=all&sort=updated',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer gho_token' }),
      }),
    )
  })
})

describe('verifyGitHubRepositoryVisible', () => {
  it('returns true when the token can see the configured-org repository', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ full_name: 'example-org/example-backend' }), { status: 200 }),
    )

    await expect(
      verifyGitHubRepositoryVisible('gho_token', 'example-org', 'example-backend'),
    ).resolves.toBe(true)
  })

  it('returns false when GitHub rejects repository visibility', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }),
    )

    await expect(
      verifyGitHubRepositoryVisible('gho_token', 'example-org', 'example-backend'),
    ).resolves.toBe(false)
  })
})
