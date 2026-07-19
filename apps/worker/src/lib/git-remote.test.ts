import { describe, expect, it, vi } from 'vitest'
import { parseLsRemoteHead, parseSymrefHead, resolveRemoteHead } from './git-remote.js'

describe('parseLsRemoteHead', () => {
  it('extracts the sha for the requested branch ref', () => {
    const output = ['a1b2c3\trefs/heads/main', 'd4e5f6\trefs/heads/feature'].join('\n')
    expect(parseLsRemoteHead(output, 'main')).toBe('a1b2c3')
  })

  it('returns null when the branch is absent', () => {
    expect(parseLsRemoteHead('a1b2c3\trefs/heads/main', 'develop')).toBeNull()
  })

  it('trims and ignores blank lines', () => {
    const output = '\n  a1b2c3\trefs/heads/main  \n\n'
    expect(parseLsRemoteHead(output, 'main')).toBe('a1b2c3')
  })

  it('does not let a similarly-named branch shadow the exact ref', () => {
    const output = ['111\trefs/heads/feature/main', '222\trefs/heads/main'].join('\n')
    expect(parseLsRemoteHead(output, 'main')).toBe('222')
  })
})

describe('parseSymrefHead', () => {
  it('extracts the default branch and sha from --symref HEAD output', () => {
    const output = 'ref: refs/heads/main\tHEAD\nabc123\tHEAD'
    expect(parseSymrefHead(output)).toEqual({ branch: 'main', sha: 'abc123' })
  })

  it('handles a non-main default with a slashed branch name', () => {
    const output = 'ref: refs/heads/feat/rollbar\tHEAD\ndeadbeef\tHEAD'
    expect(parseSymrefHead(output)).toEqual({ branch: 'feat/rollbar', sha: 'deadbeef' })
  })

  it('ignores blank lines and surrounding whitespace', () => {
    const output = '\n  ref: refs/heads/openprose\tHEAD  \n  999\tHEAD \n'
    expect(parseSymrefHead(output)).toEqual({ branch: 'openprose', sha: '999' })
  })

  it('returns null when there is no HEAD symref', () => {
    expect(parseSymrefHead('')).toBeNull()
    expect(parseSymrefHead('abc123\trefs/heads/main')).toBeNull()
  })
})

describe('resolveRemoteHead', () => {
  const url = 'https://token@github.com/o/r.git'

  it('returns the requested branch when it exists on the remote', async () => {
    const run = vi.fn(async (args: string[]) => {
      if (args[0] === '--heads') return '111\trefs/heads/main'
      throw new Error('symref should not be reached')
    })
    expect(await resolveRemoteHead(url, 'main', run)).toEqual({ sha: '111', branch: 'main' })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('falls back to the remote HEAD default when the stored branch is absent', async () => {
    const run = vi.fn(async (args: string[]) => {
      if (args[0] === '--heads') return '' // stored "main" not present
      if (args[0] === '--symref') return 'ref: refs/heads/openprose\tHEAD\n999\tHEAD'
      return ''
    })
    expect(await resolveRemoteHead(url, 'main', run)).toEqual({ sha: '999', branch: 'openprose' })
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('throws when neither the branch nor a default HEAD resolves', async () => {
    const run = vi.fn(async () => '')
    await expect(resolveRemoteHead(url, 'main', run)).rejects.toThrow(/not found/)
  })

  it('redacts credentials from git runner errors', async () => {
    const run = async () => {
      throw new Error('fatal: could not read https://x-oauth-token:SECRET@github.com/o/r.git')
    }
    let message = ''
    try {
      await resolveRemoteHead(url, 'main', run)
    } catch (err) {
      message = String((err as Error).message)
    }
    expect(message.length).toBeGreaterThan(0)
    expect(message).not.toContain('SECRET')
  })
})
