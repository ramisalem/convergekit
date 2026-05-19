export function sanitizeCloneUrlForDisplay(cloneUrl: string): string {
  try {
    const parsed = new URL(cloneUrl)
    parsed.username = ''
    parsed.password = ''
    return parsed.toString()
  } catch {
    return cloneUrl
  }
}

export function serializeRepositoryForResponse<T extends { cloneUrl: string }>(repository: T): T {
  return {
    ...repository,
    cloneUrl: sanitizeCloneUrlForDisplay(repository.cloneUrl),
  }
}
