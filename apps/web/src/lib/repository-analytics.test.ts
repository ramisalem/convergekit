import { afterEach, describe, expect, it, vi } from 'vitest'
import { trackRepositoryDetailEvent } from './repository-analytics'

class TestCustomEvent extends Event {
  detail: unknown

  constructor(type: string, init?: { detail?: unknown }) {
    super(type)
    this.detail = init?.detail
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('trackRepositoryDetailEvent', () => {
  it('dispatches a browser event that analytics owners can subscribe to', () => {
    const dispatch = vi.fn()
    vi.stubGlobal('window', { dispatchEvent: dispatch })
    vi.stubGlobal('CustomEvent', TestCustomEvent)

    trackRepositoryDetailEvent({
      name: 'repo_guide_impression',
      repositoryId: 'repo-1',
      tab: 'guide',
    })

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'convergekit:repository-detail',
    }))
  })
})
