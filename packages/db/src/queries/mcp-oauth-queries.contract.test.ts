import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')

describe('getRepositoriesMetaByIds', () => {
  it('is exported and aggregates last-indexed across branches', () => {
    expect(source).toContain('export async function getRepositoriesMetaByIds')
    expect(source).toContain('defaultBranch')
    expect(source).toContain('lastIndexedAt')
    // Bug fix: max() across all branches, not a name-matched single-branch join.
    expect(source).toContain('max(')
    // New field surfaced to MCP clients.
    expect(source).toContain('status: repositories.status')
  })
})
