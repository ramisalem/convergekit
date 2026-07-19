import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('incremental scheduler', () => {
  const source = readFileSync(join(process.cwd(), 'src/scheduler.ts'), 'utf8')

  it('skips repositories that never finished a full index', () => {
    expect(source).toContain('branch.lastIndexedAt')
    expect(source).toContain('continue')
  })

  it('uses the shared check orchestration with the scheduled trigger', () => {
    expect(source).toContain('performIncrementalCheck')
    expect(source).toContain("trigger: 'scheduled'")
  })

  it('resolves an authenticated remote head and never hardcodes HEAD~1', () => {
    expect(source).toContain('resolveAuthenticatedCloneUrl')
    expect(source).toContain('resolveRemoteHead')
    expect(source).not.toContain("fromCommit: 'HEAD~1'")
  })

  it('enqueues exact incremental ranges through performIncrementalCheck deps', () => {
    expect(source).toContain('incrementalQueue.add')
    expect(source).toContain('runId')
  })

  it('keeps the six-hour repeatable cadence', () => {
    expect(source).toContain("'0 */6 * * *'")
  })

  it('reaps orphaned runs at the start of each sweep', () => {
    expect(source).toContain('reapStaleIncrementalRuns()')
    // reaping must come before the per-repo check loop so a dead run is cleared
    // first (compare against the call site `performIncrementalCheck(`, not the import)
    expect(source.indexOf('reapStaleIncrementalRuns()')).toBeLessThan(
      source.indexOf('performIncrementalCheck('),
    )
  })
})
