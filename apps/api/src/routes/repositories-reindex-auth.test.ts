import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function routeBlock(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end)

  expect(startIndex).toBeGreaterThanOrEqual(0)
  expect(endIndex).toBeGreaterThan(startIndex)

  return source.slice(startIndex, endIndex)
}

describe('repository re-index clone authentication', () => {
  const source = readFileSync(join(process.cwd(), 'src/routes/repositories.ts'), 'utf8')

  it('refreshes private GitHub clone credentials before queueing analysis', () => {
    const reindexRoute = routeBlock(
      source,
      "repositoryRoutes.post('/:id/reindex'",
      "repositoryRoutes.post('/:id/regenerate-wiki'",
    )

    expect(source).toContain('function buildAuthenticatedCloneUrl')
    expect(source).toContain('async function resolveRepositoryAnalysisCloneUrl')
    expect(source).toContain('eq(account.userId, repo.userId)')
    expect(source).toContain("eq(account.providerId, 'github')")
    expect(source).toContain('buildAuthenticatedCloneUrl(repo.cloneUrl, githubAccount.accessToken)')

    expect(reindexRoute).toContain('const cloneUrl = await resolveRepositoryAnalysisCloneUrl(repo)')
    expect(reindexRoute).toContain('cloneUrl,')
    expect(reindexRoute).not.toContain('cloneUrl: repo.cloneUrl')
  })

  it('resolves clone credentials before deleting existing indexed data', () => {
    const reindexRoute = routeBlock(
      source,
      "repositoryRoutes.post('/:id/reindex'",
      "repositoryRoutes.post('/:id/regenerate-wiki'",
    )

    const cloneIndex = reindexRoute.indexOf(
      'const cloneUrl = await resolveRepositoryAnalysisCloneUrl(repo)',
    )
    const deleteDocumentsIndex = reindexRoute.indexOf('await db.delete(documents)')
    const deleteWikiIndex = reindexRoute.indexOf('await db.delete(wikiPages)')
    const resetIndex = reindexRoute.indexOf('await resetBranchIndexState(branch.id)')

    expect(cloneIndex).toBeGreaterThanOrEqual(0)
    expect(deleteDocumentsIndex).toBeGreaterThan(cloneIndex)
    expect(deleteWikiIndex).toBeGreaterThan(cloneIndex)
    expect(resetIndex).toBeGreaterThan(cloneIndex)
  })

  it('uses the same clone URL builder when creating private repositories', () => {
    const createRoute = routeBlock(source, "repositoryRoutes.post('/'", "repositoryRoutes.get('/'")

    expect(createRoute).toContain('buildAuthenticatedCloneUrl(cloneUrl, token)')
    expect(createRoute).not.toContain("parsed.username = 'x-oauth-token'")
  })
})
