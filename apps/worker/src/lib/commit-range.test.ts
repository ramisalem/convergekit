import { describe, expect, it } from 'vitest'
import { isShaLike } from './commit-range.js'

describe('isShaLike', () => {
  it('accepts full and abbreviated hex commit SHAs', () => {
    expect(isShaLike('148a9e65010b3a0e2c6ef90be5aaaf942a3f93bc')).toBe(true) // 40-char
    expect(isShaLike('1234abc')).toBe(true) // 7-char abbreviation
    expect(isShaLike('ABCDEF1234')).toBe(true) // upper-case hex
  })

  it('rejects relative refs, branch names, and junk that the old scheduler emitted', () => {
    for (const value of [
      'HEAD',
      'HEAD~1',
      'HEAD^',
      'main',
      'origin/main',
      '',
      ' ',
      '12345', // too short
      'xyz123g', // non-hex
      '148a9e6501...', // truncated with dots
    ]) {
      expect(isShaLike(value)).toBe(false)
    }
  })
})
