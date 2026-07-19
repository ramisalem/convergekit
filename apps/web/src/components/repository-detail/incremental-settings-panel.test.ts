import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('advanced settings incremental panel', () => {
  const source = readFileSync(new URL('./settings-tab.tsx', import.meta.url), 'utf8')

  it('is admin-gated alongside re-index and regenerate', () => {
    const adminBlock = source.slice(source.indexOf('isAdmin && ('), source.length)
    expect(adminBlock).toContain('Incremental indexing')
    expect(adminBlock).toContain('Check now')
  })

  it('wires the three admin controls to the api client', () => {
    expect(source).toContain('repositoriesApi.checkIncrementalNow')
    expect(source).toContain('repositoriesApi.pauseIncremental')
    expect(source).toContain('repositoriesApi.resumeIncremental')
  })

  it('loads and renders run history with counts and duration', () => {
    expect(source).toContain('repositoriesApi.listIncrementalRuns')
    expect(source).toContain('changedFileCount')
    expect(source).toContain('durationMs')
  })

  it('keeps incremental separate from full re-index and regenerate wiki', () => {
    expect(source).toContain('Re-index repository')
    expect(source).toContain('Regenerate Wiki')
  })
})
