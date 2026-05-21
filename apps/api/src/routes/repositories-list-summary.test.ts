import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('repository list summary route contract', () => {
  it('adds indexed, language, LOC, and chat metadata to repository list responses', () => {
    const source = readFileSync(join(process.cwd(), 'src/routes/repositories.ts'), 'utf8')

    expect(source).toContain('buildRepositoryListSummaryMap')
    expect(source).toContain('chatSessions')
    expect(source).toContain('documents.programmingLanguage')
    expect(source).toContain('branches.lastIndexedAt')
    expect(source).toContain('lineCountSql')
    expect(source).toContain('listSummary: summaries.get(repo.id)')
  })
})
