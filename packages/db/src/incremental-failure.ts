export type IncrementalFailure = {
  failureReason: string
  failureCode: string
}

const GENERIC =
  'Incremental check failed; existing documentation is still available. Retry from Advanced Settings.'

export function formatIncrementalFailure(raw: string | null | undefined): IncrementalFailure {
  if (!raw) return { failureReason: GENERIC, failureCode: 'unknown' }
  const normalized = raw.toLowerCase()

  if (normalized.includes('key limit exceeded') || normalized.includes('insufficient credits')) {
    return {
      failureCode: 'provider_limit_exceeded',
      failureReason:
        'OpenRouter key limit exceeded. Add a new OpenRouter API key or increase the key limit, then re-run indexing from Advanced Settings.',
    }
  }
  if (
    normalized.includes('authentication failed') ||
    normalized.includes('invalid username or token')
  ) {
    return {
      failureCode: 'git_auth_failed',
      failureReason:
        'GitHub authentication failed. Reconnect GitHub, then re-run the incremental check.',
    }
  }
  if (normalized.includes('invalid api key') || normalized.includes('unauthorized')) {
    return {
      failureCode: 'provider_auth_failed',
      failureReason:
        'AI provider authentication failed. Re-save the AI provider settings, then re-run indexing from Advanced Settings.',
    }
  }
  return { failureReason: GENERIC, failureCode: 'unknown' }
}

// Failure codes that will not succeed on a retry — retrying just re-clones the
// repo and re-embeds changed files for nothing.
const NON_RETRYABLE_FAILURE_CODES = new Set([
  'provider_limit_exceeded',
  'provider_auth_failed',
  'git_auth_failed',
])

/**
 * Whether a failed incremental run is worth retrying. Non-transient failures
 * (provider quota/auth, git auth) are not; everything else (incl. `unknown`,
 * e.g. a flaky clone) is.
 */
export function isRetryableIncrementalFailure(failureCode: string): boolean {
  return !NON_RETRYABLE_FAILURE_CODES.has(failureCode)
}
