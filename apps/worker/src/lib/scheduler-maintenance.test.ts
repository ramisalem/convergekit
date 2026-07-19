import { describe, expect, it, vi } from 'vitest'
import { pruneObsoleteSchedulers } from './scheduler-maintenance.js'

describe('pruneObsoleteSchedulers', () => {
  it('removes every scheduler that is not the canonical tick and keeps the tick', async () => {
    const removeScheduler = vi.fn().mockResolvedValue(undefined)
    const result = await pruneObsoleteSchedulers({
      listSchedulers: async () => [
        { key: 'tick-key', name: 'scheduler-tick' },
        { key: 'sync-a', name: 'sync' },
        { key: 'sync-b', name: 'sync' },
      ],
      removeScheduler,
    })

    expect(result.kept).toEqual(['tick-key'])
    expect(result.removed).toEqual(['sync-a', 'sync-b'])
    expect(result.failed).toEqual([])
    expect(removeScheduler).toHaveBeenCalledTimes(2)
    expect(removeScheduler).toHaveBeenCalledWith('sync-a')
    expect(removeScheduler).toHaveBeenCalledWith('sync-b')
    expect(removeScheduler).not.toHaveBeenCalledWith('tick-key')
  })

  it('is a no-op when only the canonical tick exists', async () => {
    const removeScheduler = vi.fn().mockResolvedValue(undefined)
    const result = await pruneObsoleteSchedulers({
      listSchedulers: async () => [{ key: 'tick-key', name: 'scheduler-tick' }],
      removeScheduler,
    })

    expect(removeScheduler).not.toHaveBeenCalled()
    expect(result).toEqual({ removed: [], kept: ['tick-key'], failed: [] })
  })

  it('continues past a failed removal and records it instead of throwing', async () => {
    const removeScheduler = vi
      .fn()
      .mockRejectedValueOnce(new Error('redis blip'))
      .mockResolvedValue(undefined)

    const result = await pruneObsoleteSchedulers({
      listSchedulers: async () => [
        { key: 'sync-a', name: 'sync' },
        { key: 'sync-b', name: 'sync' },
      ],
      removeScheduler,
    })

    expect(result.failed).toEqual(['sync-a'])
    expect(result.removed).toEqual(['sync-b'])
    expect(removeScheduler).toHaveBeenCalledTimes(2)
  })

  it('honors a custom canonical name', async () => {
    const removeScheduler = vi.fn().mockResolvedValue(undefined)
    const result = await pruneObsoleteSchedulers({
      listSchedulers: async () => [
        { key: 'keep', name: 'driver' },
        { key: 'drop', name: 'scheduler-tick' },
      ],
      removeScheduler,
      canonicalName: 'driver',
    })

    expect(result.kept).toEqual(['keep'])
    expect(result.removed).toEqual(['drop'])
  })
})
