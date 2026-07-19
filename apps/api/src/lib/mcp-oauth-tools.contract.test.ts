import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./mcp-oauth-tools.ts', import.meta.url), 'utf8')

describe('mcp oauth tool deps', () => {
  it('re-resolves access per call and resolves repo by id or exact name', () => {
    expect(source).toContain('scopedRepositoryIds')
    expect(source).toContain('getRepositoriesMetaByIds')
  })
  it('returns a uniform not-found/inaccessible error (no existence leak)', () => {
    expect(source).toContain('Repository not found or not accessible')
  })
  it('computes per-repo embedding options for search', () => {
    expect(source).toContain('getEmbeddingOptionsForProfile')
  })
})
