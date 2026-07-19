import { describe, expect, it, vi } from 'vitest'
import { deriveIncrementalCheckDecision, performIncrementalCheck } from './incremental-check.js'

describe('deriveIncrementalCheckDecision', () => {
  it('skips repos that never completed a full index', () => {
    expect(
      deriveIncrementalCheckDecision({
        lastIndexedAt: null,
        enabled: true,
        trigger: 'scheduled',
        remoteHead: 'bbb',
        indexedCommitSha: null,
      }).action,
    ).toBe('skip_never_indexed')
  })

  it('skips paused repos for scheduled checks only', () => {
    expect(
      deriveIncrementalCheckDecision({
        lastIndexedAt: new Date(),
        enabled: false,
        trigger: 'scheduled',
        remoteHead: 'bbb',
        indexedCommitSha: 'aaa',
      }).action,
    ).toBe('skip_paused')
  })

  it('allows manual checks even when paused', () => {
    expect(
      deriveIncrementalCheckDecision({
        lastIndexedAt: new Date(),
        enabled: false,
        trigger: 'manual',
        remoteHead: 'bbb',
        indexedCommitSha: 'aaa',
      }).action,
    ).toBe('queue')
  })

  it('skips with no_baseline when indexed but indexedCommitSha is null (pre-0017)', () => {
    expect(
      deriveIncrementalCheckDecision({
        lastIndexedAt: new Date(),
        enabled: true,
        trigger: 'scheduled',
        remoteHead: 'bbb',
        indexedCommitSha: null,
      }).action,
    ).toBe('skip_no_baseline')
  })

  it('skips with no_baseline even for manual checks (cannot diff without a baseline)', () => {
    expect(
      deriveIncrementalCheckDecision({
        lastIndexedAt: new Date(),
        enabled: false,
        trigger: 'manual',
        remoteHead: 'bbb',
        indexedCommitSha: null,
      }).action,
    ).toBe('skip_no_baseline')
  })

  it('records a no-op when remote head equals indexed commit', () => {
    expect(
      deriveIncrementalCheckDecision({
        lastIndexedAt: new Date(),
        enabled: true,
        trigger: 'scheduled',
        remoteHead: 'aaa',
        indexedCommitSha: 'aaa',
      }).action,
    ).toBe('noop')
  })

  it('queues the exact range when the remote head differs', () => {
    const decision = deriveIncrementalCheckDecision({
      lastIndexedAt: new Date(),
      enabled: true,
      trigger: 'scheduled',
      remoteHead: 'bbb',
      indexedCommitSha: 'aaa',
    })
    expect(decision).toEqual({ action: 'queue', fromCommit: 'aaa', toCommit: 'bbb' })
  })
})

describe('performIncrementalCheck', () => {
  const baseInput = {
    repositoryId: 'repo-1',
    branchId: 'branch-1',
    branchName: 'main',
    trigger: 'scheduled' as const,
    lastIndexedAt: new Date(),
    enabled: true,
    indexedCommitSha: 'aaa',
  }

  function makeDeps(overrides = {}) {
    return {
      getActiveIncrementalRun: vi.fn().mockResolvedValue(null),
      resolveRemoteHead: vi.fn().mockResolvedValue('bbb'),
      createIndexingRun: vi.fn().mockResolvedValue({ id: 'run-1' }),
      updateIndexingRun: vi.fn().mockResolvedValue({ id: 'run-1' }),
      enqueueIncremental: vi.fn().mockResolvedValue({ queueName: 'incremental-update', jobId: 'job-1' }),
      ...overrides,
    }
  }

  it('reuses an active run instead of creating a duplicate', async () => {
    const deps = makeDeps({ getActiveIncrementalRun: vi.fn().mockResolvedValue({ id: 'existing' }) })
    const result = await performIncrementalCheck(deps, baseInput)
    expect(result).toEqual({ outcome: 'reused', run: { id: 'existing' } })
    expect(deps.resolveRemoteHead).not.toHaveBeenCalled()
    expect(deps.createIndexingRun).not.toHaveBeenCalled()
  })

  it('records a completed_noop run without enqueueing when fresh', async () => {
    const deps = makeDeps({ resolveRemoteHead: vi.fn().mockResolvedValue('aaa') })
    const result = await performIncrementalCheck(deps, baseInput)
    expect(result.outcome).toBe('noop')
    expect(deps.enqueueIncremental).not.toHaveBeenCalled()
    expect(deps.updateIndexingRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed_noop' }),
    )
  })

  it('queues an exact range and records queue metadata when changed', async () => {
    const deps = makeDeps()
    const result = await performIncrementalCheck(deps, baseInput)
    expect(result.outcome).toBe('queued')
    expect(deps.enqueueIncremental).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', fromCommit: 'aaa', toCommit: 'bbb' }),
    )
    expect(deps.updateIndexingRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'queued', queueName: 'incremental-update', jobId: 'job-1' }),
    )
  })

  it('returns skipped for never-indexed repos without resolving remote head', async () => {
    const deps = makeDeps()
    const result = await performIncrementalCheck(deps, { ...baseInput, lastIndexedAt: null })
    expect(result.outcome).toBe('skipped_never_indexed')
    expect(deps.resolveRemoteHead).not.toHaveBeenCalled()
  })

  it('returns skipped_no_baseline without resolving remote head or writing a run', async () => {
    const deps = makeDeps()
    const result = await performIncrementalCheck(deps, { ...baseInput, indexedCommitSha: null })
    expect(result.outcome).toBe('skipped_no_baseline')
    expect(deps.resolveRemoteHead).not.toHaveBeenCalled()
    expect(deps.createIndexingRun).not.toHaveBeenCalled()
  })

  it('recovers from a concurrent unique-violation by reusing the winning run', async () => {
    let activeCalls = 0
    const deps = makeDeps({
      // First lookup sees no active run (race); after the failed insert the
      // winner's row is visible.
      getActiveIncrementalRun: vi.fn().mockImplementation(() => {
        activeCalls += 1
        return Promise.resolve(activeCalls === 1 ? null : { id: 'winner' })
      }),
      createIndexingRun: vi.fn().mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' })),
    })
    const result = await performIncrementalCheck(deps, baseInput)
    expect(result).toEqual({ outcome: 'reused', run: { id: 'winner' } })
    expect(deps.enqueueIncremental).not.toHaveBeenCalled()
  })

  it('returns a benign raced outcome (not a throw) when the winner already finished', async () => {
    const deps = makeDeps({
      // Loser never sees an active run: winner finished between INSERT and refetch.
      getActiveIncrementalRun: vi.fn().mockResolvedValue(null),
      createIndexingRun: vi.fn().mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' })),
    })
    const result = await performIncrementalCheck(deps, baseInput)
    expect(result).toEqual({ outcome: 'raced' })
    expect(deps.enqueueIncremental).not.toHaveBeenCalled()
  })

  it('rethrows non-unique-violation insert errors', async () => {
    const deps = makeDeps({
      createIndexingRun: vi.fn().mockRejectedValue(new Error('connection reset')),
    })
    await expect(performIncrementalCheck(deps, baseInput)).rejects.toThrow('connection reset')
  })
})
