type JobLike = {
  id?: string | number | null
  data?: { repositoryId?: string }
}

export type QueueLike = {
  name: string
  getJobs(states: Array<'active' | 'waiting' | 'delayed' | 'prioritized'>): Promise<JobLike[]>
}

const DOC_JOB_STATES: Array<'active' | 'waiting' | 'delayed' | 'prioritized'> = [
  'active',
  'waiting',
  'delayed',
  'prioritized',
]

export async function findExistingRepositoryDocsJob(
  repositoryId: string,
  queues: QueueLike[],
): Promise<{ jobId: string; queue: string } | null> {
  for (const queueName of ['wiki-generation', 'mind-map']) {
    const queue = queues.find((candidate) => candidate.name === queueName)
    if (!queue) continue

    for (const state of DOC_JOB_STATES) {
      const jobs = await queue.getJobs([state])
      const match = jobs.find((job) => {
        if (job.id == null) return false
        return job.data?.repositoryId === repositoryId && !String(job.id).startsWith('repeat:')
      })

      if (match?.id != null) {
        return { jobId: String(match.id), queue: queue.name }
      }
    }
  }

  return null
}
