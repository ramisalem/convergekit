import { describe, expect, it } from 'vitest'
import { getAuthorityLabel, getAuthorityTone, pathFromCitation } from './evidence-authority'

describe('pathFromCitation', () => {
  it('extracts the source path before the line range', () => {
    expect(pathFromCitation('src/auth/login.ts:12-20')).toBe('src/auth/login.ts')
  })
})

describe('getAuthorityLabel', () => {
  it('maps evidence tiers to user-facing labels', () => {
    expect(getAuthorityLabel('A')).toBe('Code')
    expect(getAuthorityLabel('B')).toBe('Tests')
    expect(getAuthorityLabel('C')).toBe('Docs')
    expect(getAuthorityLabel('D')).toBe('Design/History')
  })
})

describe('getAuthorityTone', () => {
  it('keeps docs neutral and stale warning distinct', () => {
    expect(getAuthorityTone({ evidenceTier: 'C', evidenceAlignmentStatus: null })).toContain('slate')
    expect(getAuthorityTone({ evidenceTier: 'D', evidenceAlignmentStatus: 'stale' })).toContain('orange')
  })
})
