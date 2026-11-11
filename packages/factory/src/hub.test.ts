import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { stageFromLabels } from './conventions.js'
import { parseHandles, parseProfile, parseRepoList } from './hub.js'

// Synthetic fixtures for a made-up team; no real team's profile belongs in this repo.
const fixtures = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixture = (name: string) => readFileSync(join(fixtures, name), 'utf8')

describe('parseRepoList', () => {
  it('keeps owner/name lines in order and skips comments, blanks, junk and duplicates', () => {
    expect(parseRepoList(fixture('repos.txt'))).toEqual([
      'acme/storefront',
      'acme-labs/billing_api',
      'acme/factory-hub',
    ])
  })
})

describe('parseProfile', () => {
  it('reads the Repo table', () => {
    const profile = parseProfile(fixture('storefront.md'))
    expect(profile).toMatchObject({
      repo: 'acme/storefront',
      product: 'Acme Shop',
      app: 'Storefront (Next.js)',
      integrationBranch: 'develop',
      productionBranch: 'main',
      stagingSite: 'https://staging.shop.example.com',
    })
  })

  it('reads the People table as GitHub handles', () => {
    const { people } = parseProfile(fixture('storefront.md'))
    expect(people).toEqual({
      productOwners: ['pat-owner'],
      qa: ['quinn-qa'],
      developers: ['dev-one', 'dev-two'],
      reviewAccounts: ['acme-review-bot'],
      umbrellaApprovals: 2,
    })
  })

  it('ignores tables inside code fences and tables with more than two columns', () => {
    const { sections } = parseProfile(fixture('storefront.md'))
    expect(sections.Setup).toBeUndefined()
    expect(sections.Checks).toBeUndefined()
  })

  it('treats "not recorded yet" as missing', () => {
    const profile = parseProfile(fixture('billing_api.md'))
    expect(profile).toMatchObject({
      repo: 'acme-labs/billing_api',
      app: null,
      integrationBranch: 'main.dev',
      productionBranch: null,
      stagingSite: null,
    })
    expect(profile.people).toEqual({
      productOwners: ['pat-owner'],
      qa: [],
      developers: [],
      reviewAccounts: [],
      umbrellaApprovals: 1,
    })
  })

  it('returns empty values for a profile with no tables', () => {
    expect(parseProfile('# Nothing here\n')).toMatchObject({
      repo: null,
      product: null,
      people: { productOwners: [], umbrellaApprovals: null },
      sections: {},
    })
  })
})

describe('parseHandles', () => {
  it('does not read email addresses as handles', () => {
    expect(parseHandles('@a-b, team@example.com and @c')).toEqual(['a-b', 'c'])
  })
})

describe('stageFromLabels', () => {
  it('finds the stage label and ignores unknown stages', () => {
    expect(stageFromLabels(['bug', 'waiting:owner', 'stage:qa'])).toBe('qa')
    expect(stageFromLabels(['stage:unknown'])).toBeNull()
  })
})
