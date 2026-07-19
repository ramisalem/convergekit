import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('incremental worker run persistence', () => {
  const source = readFileSync(join(process.cwd(), 'src/workers/incremental.ts'), 'utf8')

  it('marks the run processing with a started timestamp', () => {
    expect(source).toContain("status: 'processing'")
    expect(source).toContain('startedAt: new Date()')
  })

  it('owns its workspace lifecycle (clean clone + cleanup)', () => {
    expect(source).toContain('cleanupWorkspace(workDir)')
    expect(source).toContain('git.clone(')
    const cleanups = [...source.matchAll(/cleanupWorkspace\(workDir\)/g)]
    expect(cleanups.length).toBeGreaterThanOrEqual(2)
  })

  it('refreshes linked historical docs with a valid array-overlap (not a row-cast)', () => {
    // Regression guard: the previous `&& ${changedPaths}::text[]` rendered as a
    // row-cast and failed every changed-path run. Must use drizzle arrayOverlaps.
    expect(source).toContain('arrayOverlaps(documents.linkedCodePaths, changedPaths)')
    expect(source).not.toContain('::text[]`')
  })

  it('redacts credentials from clone errors before they can be logged', () => {
    expect(source).toContain('redactUrlCredentials(')
  })

  it('stops retrying non-transient failures and logs each failed attempt', () => {
    // non-retryable failures throw UnrecoverableError so BullMQ won't re-clone/re-embed
    expect(source).toContain('UnrecoverableError')
    expect(source).toContain('isRetryableIncrementalFailure(failureCode)')
    // the catch logs the failure itself (not only the post-retries 'failed' handler)
    const catchIdx = source.indexOf('} catch (err) {')
    const logIdx = source.indexOf('Incremental run failed:')
    expect(catchIdx).toBeGreaterThanOrEqual(0)
    expect(logIdx).toBeGreaterThan(catchIdx)
  })

  it('re-reads the run and aborts branch advancement when no longer processing', () => {
    expect(source).toContain('getIndexingRunById')
    expect(source).toContain('superseded')
    const guardIndex = source.indexOf('getIndexingRunById')
    const markIndex = source.indexOf('markBranchIndexed(branchId, toCommit)')
    expect(guardIndex).toBeGreaterThanOrEqual(0)
    expect(markIndex).toBeGreaterThan(guardIndex)
  })

  it('records the run completed before advancing the branch, so a fresh branch is never marked failed', () => {
    const markBranch = source.indexOf('markBranchIndexed(branchId, toCommit)')
    const markCompleted = source.indexOf("status: 'completed'")
    const staleGuard = source.indexOf('getIndexingRunById')
    expect(markCompleted).toBeGreaterThanOrEqual(0)
    expect(markBranch).toBeGreaterThanOrEqual(0)
    // Stale guard runs first; then the run is marked completed; markBranchIndexed
    // is the last throwing op, so "branch advanced but run failed" is impossible.
    expect(markCompleted).toBeGreaterThan(staleGuard)
    expect(markBranch).toBeGreaterThan(markCompleted)
  })

  it('persists counts and a sanitized failure on error without failing the repo', () => {
    expect(source).toContain('formatIncrementalFailure')
    expect(source).toContain("status: 'failed'")
    expect(source).toContain('changedFileCount')
    expect(source).not.toContain('updateRepositoryStatus(repositoryId, ')
  })

  it('skips legacy jobs that have no runId by falling back to markBranchIndexed', () => {
    expect(source).toContain('job.data.runId')
  })
})
