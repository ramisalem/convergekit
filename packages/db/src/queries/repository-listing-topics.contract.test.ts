import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./repository-listing-topics.ts', import.meta.url), 'utf8')

// The orchestrator's SQL scoping is the load-bearing fix and is not covered by
// the pure-function unit tests (the @convergekit/db package has no live-DB harness).
// These source-string assertions lock the repo-vs-branch scoping so a future
// refactor cannot silently reintroduce the bug where wiki topics were filtered
// by the stale wiki_pages.branch_id.
describe('getRepositoryListingTopicsByIds scoping', () => {
  it('is exported', () => {
    expect(source).toContain('export async function getRepositoryListingTopicsByIds')
  })

  it('queries wiki pages by repository_id, never by the stale branch_id', () => {
    // wiki_pages is unique on (repository_id, slug); branch_id is never updated on
    // regeneration, so it must not be used to filter.
    expect(source).toContain('inArray(wikiPages.repositoryId, uniqueIds)')
    expect(source).not.toContain('wikiPages.branchId')
  })

  it('only surfaces finished wiki pages', () => {
    expect(source).toContain("eq(wikiPages.status, 'done')")
  })

  it('selects mind-map documents branch-scoped, then disambiguates by branch', () => {
    // Mind map IS branch-scoped (documents unique per (branch_id, path)); it is
    // resolved via the recency tiebreak, unlike wiki.
    expect(source).toContain('eq(documents.path, MINDMAP_PATH)')
    expect(source).toContain('pickRepresentativeBranchIds')
  })
})
