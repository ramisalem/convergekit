import { describe, expect, it } from 'vitest'
import { redactUrlCredentials } from './redact.js'

describe('redactUrlCredentials', () => {
  it('redacts user:password credentials embedded in a URL', () => {
    expect(
      redactUrlCredentials('https://x-oauth-token:gho_secret123@github.com/example-org/x.git'),
    ).toBe('https://***@github.com/example-org/x.git')
  })

  it('redacts a username-only credential', () => {
    expect(redactUrlCredentials('https://gho_token@github.com/x.git')).toBe(
      'https://***@github.com/x.git',
    )
  })

  it('redacts credentials inside a longer git error message', () => {
    const out = redactUrlCredentials(
      'fatal: unable to access https://x-oauth-token:gho_abc@github.com/x.git/: 403',
    )
    expect(out).not.toContain('gho_abc')
    expect(out).toContain('https://***@github.com/x.git')
  })

  it('leaves credential-free URLs (incl. ports) unchanged', () => {
    expect(redactUrlCredentials('cloning https://github.com:443/x.git')).toBe(
      'cloning https://github.com:443/x.git',
    )
  })

  it('leaves text without URLs unchanged', () => {
    expect(redactUrlCredentials('some unexpected boom')).toBe('some unexpected boom')
  })

  it('redacts every occurrence', () => {
    expect(redactUrlCredentials('a https://u:p@h/x b https://u2:p2@h2/y')).toBe(
      'a https://***@h/x b https://***@h2/y',
    )
  })

  it('handles null/undefined/empty safely', () => {
    expect(redactUrlCredentials(null)).toBe('')
    expect(redactUrlCredentials(undefined)).toBe('')
    expect(redactUrlCredentials('')).toBe('')
  })
})
