export type RepositoryIndexingFailure = {
  message: string
}

export function formatRepositoryIndexingFailure(
  failedReason: string | null | undefined,
): RepositoryIndexingFailure | null {
  if (!failedReason) return null

  const normalized = failedReason.toLowerCase()

  if (normalized.includes('key limit exceeded')) {
    return {
      message:
        'OpenRouter key limit exceeded. Add a new OpenRouter API key or increase the key limit, then re-index from Advanced Settings.',
    }
  }

  if (
    normalized.includes('authentication failed') ||
    normalized.includes('invalid username or token')
  ) {
    return {
      message: 'GitHub authentication failed. Reconnect GitHub, then re-index this repository.',
    }
  }

  if (normalized.includes('unable to authenticate data')) {
    return {
      message:
        'The saved AI settings could not be decrypted. Re-save the AI provider settings, then re-index this repository.',
    }
  }

  if (normalized.includes('invalid api key') || normalized.includes('unauthorized')) {
    return {
      message:
        'AI provider authentication failed. Re-save the AI provider settings, then re-index from Advanced Settings.',
    }
  }

  if (normalized.includes('insufficient credits')) {
    return {
      message:
        'AI provider credits are exhausted. Add credits or switch provider settings, then re-index from Advanced Settings.',
    }
  }

  return {
    message: 'Indexing failed. Check the worker logs for details, then re-index this repository.',
  }
}

export async function getLatestRepositoryIndexingFailure(
  repositoryId: string,
): Promise<RepositoryIndexingFailure | null> {
  const { repositoryQueue } = await import('@convergekit/queues')
  const failedJobs = await repositoryQueue.getJobs(['failed'], 0, 50, false)
  const latestJob = failedJobs
    .filter((job) => job.data?.repositoryId === repositoryId)
    .sort((a, b) => (b.finishedOn ?? 0) - (a.finishedOn ?? 0))[0]

  return formatRepositoryIndexingFailure(latestJob?.failedReason)
}
