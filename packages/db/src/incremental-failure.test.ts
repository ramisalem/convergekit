import { describe, expect, it } from 'vitest'
import { formatIncrementalFailure, isRetryableIncrementalFailure } from './incremental-failure.js'

describe('formatIncrementalFailure', () => {
  it('returns actionable copy for provider key-limit errors with a stable code', () => {
    const result = formatIncrementalFailure('OpenRouter key limit exceeded for request')
    expect(result.failureCode).toBe('provider_limit_exceeded')
    expect(result.failureReason).toContain('OpenRouter key limit exceeded')
    expect(result.failureReason).toContain('Advanced Settings')
  })

  it('returns a GitHub auth message + code', () => {
    const result = formatIncrementalFailure('fatal: Authentication failed for repo')
    expect(result.failureCode).toBe('git_auth_failed')
    expect(result.failureReason).toContain('Reconnect GitHub')
  })

  it('falls back to a generic non-destructive message', () => {
    const result = formatIncrementalFailure('some unexpected boom')
    expect(result.failureCode).toBe('unknown')
    expect(result.failureReason).toContain('existing documentation is still available')
  })

  it('handles null/empty input', () => {
    expect(formatIncrementalFailure(null).failureCode).toBe('unknown')
  })
})

describe('isRetryableIncrementalFailure', () => {
  it('does NOT retry non-transient failures (provider limit/auth, git auth)', () => {
    expect(isRetryableIncrementalFailure('provider_limit_exceeded')).toBe(false)
    expect(isRetryableIncrementalFailure('provider_auth_failed')).toBe(false)
    expect(isRetryableIncrementalFailure('git_auth_failed')).toBe(false)
  })

  it('retries unknown/transient failures (e.g. a flaky clone)', () => {
    expect(isRetryableIncrementalFailure('unknown')).toBe(true)
  })

  it('defaults to retryable for unrecognized codes', () => {
    expect(isRetryableIncrementalFailure('something_new')).toBe(true)
  })
})
