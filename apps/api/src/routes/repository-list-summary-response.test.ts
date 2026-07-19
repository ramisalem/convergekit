import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('repository list summary response', () => {
  it('populates listSummary before returning repositories', () => {
    const source = readFileSync(join(process.cwd(), 'src/routes/repositories.ts'), 'utf8')
    const listRoute = source.slice(
      source.indexOf("repositoryRoutes.get('/',"),
      source.indexOf('/**\n * GET /api/repositories/github-repos'),
    )

    expect(listRoute).toContain('getRepositoryListSummaries')
    expect(listRoute).toContain('attachRepositoryListSummaries')
    expect(listRoute).toContain('repos.map(serializeRepositoryForResponse)')
  })
})
