import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('repository detail indexing failure response', () => {
  it('includes a latest indexing failure reason for failed repositories', () => {
    const source = readFileSync(join(process.cwd(), 'src/routes/repositories.ts'), 'utf8')

    expect(source).toContain('getLatestRepositoryIndexingFailure')
    expect(source).toContain("repo.status === 'failed'")
    expect(source).toContain('indexingFailure,')
  })
})
