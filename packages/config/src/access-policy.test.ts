import { describe, expect, it } from 'vitest'

import {
  AccessPolicyViolationError,
  assertAllowedAccessPolicyEmail,
  assertAllowedAccessPolicyRepository,
  DEFAULT_ACCESS_POLICY_CONFIG,
  isAllowedAccessPolicyEmail,
  isAllowedAccessPolicyRepository,
  normalizeAccessPolicyEmail,
  parseGitHubRepositoryUrl,
  resolveAccessPolicyConfig,
} from './access-policy.js'

describe('access policy config', () => {
  it('uses open defaults when env vars are absent', () => {
    expect(resolveAccessPolicyConfig({})).toEqual(DEFAULT_ACCESS_POLICY_CONFIG)
  })

  it('normalizes configured values from env vars', () => {
    expect(
      resolveAccessPolicyConfig({
        ACCESS_ALLOWED_EMAIL_DOMAIN: ' Example.COM ',
        ACCESS_ALLOWED_GITHUB_ORG: ' Example-Org ',
        ACCESS_ALLOWED_REPOSITORY_HOST: ' GitHub.COM ',
      }),
    ).toEqual({
      allowedEmailDomain: 'example.com',
      allowedGitHubOrg: 'example-org',
      allowedRepositoryHost: 'github.com',
    })
  })

  it('does not restrict email domain or owner when optional policy values are absent', () => {
    const config = resolveAccessPolicyConfig({})
    expect(isAllowedAccessPolicyEmail('person@any-domain.test', config)).toBe(true)
    expect(
      isAllowedAccessPolicyRepository(
        { provider: 'github', cloneUrl: 'https://github.com/any-org/any-repo.git' },
        config,
      ),
    ).toBe(true)
  })

  it('rejects malformed policy values at startup', () => {
    expect(() =>
      resolveAccessPolicyConfig({
        ACCESS_ALLOWED_EMAIL_DOMAIN: '@example.com',
      }),
    ).toThrowError(/access policy/i)

    expect(() =>
      resolveAccessPolicyConfig({
        ACCESS_ALLOWED_GITHUB_ORG: '-example',
      }),
    ).toThrowError(/access policy/i)

    expect(() =>
      resolveAccessPolicyConfig({
        ACCESS_ALLOWED_REPOSITORY_HOST: 'https://github.com',
      }),
    ).toThrowError(/access policy/i)
  })
})

describe('access policy email helpers', () => {
  const config = resolveAccessPolicyConfig({
    ACCESS_ALLOWED_EMAIL_DOMAIN: 'example.com',
  })

  it('normalizes email casing and whitespace', () => {
    expect(normalizeAccessPolicyEmail(' Person@Example.COM ')).toBe('person@example.com')
  })

  it('allows only the configured exact email domain', () => {
    expect(isAllowedAccessPolicyEmail('admin@example.com', config)).toBe(true)
    expect(isAllowedAccessPolicyEmail('admin@sub.example.com', config)).toBe(false)
    expect(isAllowedAccessPolicyEmail('admin@another.test', config)).toBe(false)
  })

  it('throws a policy violation for disallowed email domains', () => {
    expect(() => assertAllowedAccessPolicyEmail('admin@another.test', config)).toThrow(
      AccessPolicyViolationError,
    )
  })
})

describe('access policy repository helpers', () => {
  const config = resolveAccessPolicyConfig({
    ACCESS_ALLOWED_GITHUB_ORG: 'example-org',
    ACCESS_ALLOWED_REPOSITORY_HOST: 'github.com',
  })

  it('parses GitHub HTTPS clone URLs with credentials stripped from policy decisions', () => {
    expect(
      parseGitHubRepositoryUrl('https://x-oauth-token:secret@github.com/example-org/example-backend.git'),
    ).toEqual({
      host: 'github.com',
      owner: 'example-org',
      name: 'example-backend',
      fullName: 'example-org/example-backend',
    })
  })

  it('rejects non-URL and incomplete repository URLs', () => {
    expect(parseGitHubRepositoryUrl('git@github.com:example-org/example-backend.git')).toBeNull()
    expect(parseGitHubRepositoryUrl('https://github.com/example-org')).toBeNull()
  })

  it('allows only configured host and organization', () => {
    expect(
      isAllowedAccessPolicyRepository(
        {
          provider: 'github',
          cloneUrl: 'https://github.com/example-org/example-backend.git',
        },
        config,
      ),
    ).toBe(true)

    expect(
      isAllowedAccessPolicyRepository(
        {
          provider: 'gitlab',
          cloneUrl: 'https://github.com/example-org/example-backend.git',
        },
        config,
      ),
    ).toBe(false)

    expect(
      isAllowedAccessPolicyRepository(
        {
          provider: 'github',
          cloneUrl: 'https://github.com/other-org/example-backend.git',
        },
        config,
      ),
    ).toBe(false)
  })

  it('throws a policy violation for disallowed repositories', () => {
    expect(() =>
      assertAllowedAccessPolicyRepository(
        {
          provider: 'github',
          cloneUrl: 'https://github.com/other-org/example-backend.git',
        },
        config,
      ),
    ).toThrow(AccessPolicyViolationError)
  })
})
