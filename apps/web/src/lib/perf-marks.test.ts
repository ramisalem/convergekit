import { afterEach, describe, expect, it, vi } from 'vitest'
import { markPerf } from './perf-marks'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('markPerf', () => {
  it('records a mark outside production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const mark = vi.fn()
    vi.stubGlobal('performance', { mark })
    markPerf('repositories:list:start')
    expect(mark).toHaveBeenCalledWith('repositories:list:start')
  })

  it('is a no-op in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const mark = vi.fn()
    vi.stubGlobal('performance', { mark })
    markPerf('repositories:list:fresh')
    expect(mark).not.toHaveBeenCalled()
  })
})
