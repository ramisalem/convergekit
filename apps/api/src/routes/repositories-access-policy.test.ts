import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('repository access policy contracts', () => {
  it('lists repositories from the configured GitHub organization only', () => {
    const source = readFileSync(join(process.cwd(), 'src/routes/repositories.ts'), 'utf8')

    expect(source).toContain('fetchAllowedGitHubRepositories')
    expect(source).not.toContain('https://api.github.com/user/repos?per_page=100')
    expect(source).not.toContain('https://api.github.com/user/orgs?per_page=100')
  })

  it('rejects repository creation outside the configured host and organization before insert', () => {
    const source = readFileSync(join(process.cwd(), 'src/routes/repositories.ts'), 'utf8')

    expect(source).toContain('assertAllowedAccessPolicyRepository')
    expect(source).toContain('verifyGitHubRepositoryVisible')
    expect(source.indexOf('assertAllowedAccessPolicyRepository')).toBeLessThan(
      source.indexOf('.insert(repositories)'),
    )
    expect(source.indexOf('verifyGitHubRepositoryVisible')).toBeLessThan(
      source.indexOf('.insert(repositories)'),
    )
  })

  it('excludes invalid legacy repositories from scoping', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/scoping.ts'), 'utf8')

    expect(source).toContain('@convergekit/config/access-policy')
    expect(source).toContain('isAllowedAccessPolicyRepository')
    expect(source).toContain('filterAllowedRepositories')
  })
})
