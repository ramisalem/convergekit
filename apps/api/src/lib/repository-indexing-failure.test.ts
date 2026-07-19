import { beforeEach, describe, expect, it, vi } from 'vitest'

const queueMocks = vi.hoisted(() => ({
  getJobs: vi.fn(),
}))

vi.mock('@convergekit/queues', () => ({
  repositoryQueue: queueMocks,
}))

import {
  formatRepositoryIndexingFailure,
  getLatestRepositoryIndexingFailure,
} from './repository-indexing-failure.js'

beforeEach(() => {
  queueMocks.getJobs.mockReset()
})

describe('formatRepositoryIndexingFailure', () => {
  it('turns OpenRouter key limit failures into clear next actions', () => {
    expect(
      formatRepositoryIndexingFailure(
        'Key limit exceeded (total limit). Manage it using https://openrouter.ai/workspaces/default/keys/sensitive-id',
      ),
    ).toEqual({
      message:
        'OpenRouter key limit exceeded. Add a new OpenRouter API key or increase the key limit, then re-index from Advanced Settings.',
    })
  })

  it('explains GitHub clone authentication failures', () => {
    expect(
      formatRepositoryIndexingFailure(
        "remote: Invalid username or token.\nfatal: Authentication failed for 'https://github.com/example-org/example-backend.git/'",
      ),
    ).toEqual({
      message: 'GitHub authentication failed. Reconnect GitHub, then re-index this repository.',
    })
  })

  it('turns invalid embedding keys into clear next actions', () => {
    expect(formatRepositoryIndexingFailure('Invalid API key')).toEqual({
      message:
        'AI provider authentication failed. Re-save the AI provider settings, then re-index from Advanced Settings.',
    })
  })

  it('turns insufficient credits into clear next actions', () => {
    expect(formatRepositoryIndexingFailure('Insufficient credits')).toEqual({
      message:
        'AI provider credits are exhausted. Add credits or switch provider settings, then re-index from Advanced Settings.',
    })
  })
})

describe('getLatestRepositoryIndexingFailure', () => {
  it('asks BullMQ for newest failed jobs first', async () => {
    queueMocks.getJobs.mockResolvedValue([])

    await getLatestRepositoryIndexingFailure('repo-id')

    expect(queueMocks.getJobs).toHaveBeenCalledWith(['failed'], 0, 50, false)
  })
})
