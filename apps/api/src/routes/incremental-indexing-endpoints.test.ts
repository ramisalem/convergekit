import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('incremental indexing endpoints', () => {
  const source = readFileSync(join(process.cwd(), 'src/routes/repositories.ts'), 'utf8')

  it('registers the four admin endpoints', () => {
    expect(source).toContain("repositoryRoutes.post('/:id/incremental-indexing/check-now'")
    expect(source).toContain("repositoryRoutes.post('/:id/incremental-indexing/pause'")
    expect(source).toContain("repositoryRoutes.post('/:id/incremental-indexing/resume'")
    expect(source).toContain("repositoryRoutes.get('/:id/incremental-indexing/runs'")
  })

  it('guards every write control behind assertRepoAdminAction', () => {
    const checkNow = source.slice(
      source.indexOf("'/:id/incremental-indexing/check-now'"),
      source.indexOf("'/:id/incremental-indexing/pause'"),
    )
    expect(checkNow).toContain('assertRepoAdminAction')
  })

  it('check-now reuses the shared performIncrementalCheck with manual trigger', () => {
    expect(source).toContain('performIncrementalCheck')
    expect(source).toContain("trigger: 'manual'")
  })

  it('supersedes active incremental runs during full re-index', () => {
    const reindex = source.slice(
      source.indexOf("repositoryRoutes.post('/:id/reindex'"),
      source.indexOf("repositoryRoutes.post('/:id/regenerate-wiki'"),
    )
    expect(reindex).toContain('supersedeActiveIncrementalRuns')
  })

  it('attaches incrementalIndexing summaries to list and detail responses', () => {
    expect(source).toContain('getIncrementalIndexingSummaries')
    expect(source).toContain('incrementalIndexing')
  })
})
