import { describe, expect, it } from 'vitest'

import { findExistingRepositoryDocsJob, type QueueLike } from './docs-jobs'

function queueWithJobs(name: string, jobsByState: Record<string, Array<{ id: string; repositoryId?: string }>>): QueueLike {
  return {
    name,
    async getJobs(states) {
      return states.flatMap((state) =>
        (jobsByState[state] ?? []).map((job) => ({
          id: job.id,
          data: job.repositoryId ? { repositoryId: job.repositoryId } : {},
        })),
      )
    },
  }
}

describe('findExistingRepositoryDocsJob', () => {
  it('prefers an active wiki-generation job for the same repository', async () => {
    const result = await findExistingRepositoryDocsJob('repo-1', [
      queueWithJobs('mind-map', { active: [{ id: 'mind-1', repositoryId: 'repo-1' }] }),
      queueWithJobs('wiki-generation', { active: [{ id: 'wiki-1', repositoryId: 'repo-1' }] }),
    ])

    expect(result).toEqual({ jobId: 'wiki-1', queue: 'wiki-generation' })
  })

  it('falls back to a queued mind-map job when no wiki job exists', async () => {
    const result = await findExistingRepositoryDocsJob('repo-1', [
      queueWithJobs('mind-map', { waiting: [{ id: 'mind-1', repositoryId: 'repo-1' }] }),
      queueWithJobs('wiki-generation', { waiting: [{ id: 'wiki-2', repositoryId: 'repo-2' }] }),
    ])

    expect(result).toEqual({ jobId: 'mind-1', queue: 'mind-map' })
  })

  it('ignores repeat jobs and jobs for other repositories', async () => {
    const result = await findExistingRepositoryDocsJob('repo-1', [
      queueWithJobs('mind-map', {
        active: [
          { id: 'repeat:123', repositoryId: 'repo-1' },
          { id: 'mind-2', repositoryId: 'repo-2' },
        ],
      }),
      queueWithJobs('wiki-generation', {
        delayed: [{ id: 'wiki-1', repositoryId: 'repo-1' }],
      }),
    ])

    expect(result).toEqual({ jobId: 'wiki-1', queue: 'wiki-generation' })
  })

  it('returns null when no docs jobs exist for the repository', async () => {
    const result = await findExistingRepositoryDocsJob('repo-1', [
      queueWithJobs('mind-map', { active: [{ id: 'mind-2', repositoryId: 'repo-2' }] }),
      queueWithJobs('wiki-generation', {}),
    ])

    expect(result).toBeNull()
  })
})
