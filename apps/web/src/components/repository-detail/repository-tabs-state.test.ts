import { describe, expect, it } from 'vitest'
import { getAvailableRepositoryTabs, normalizeRepositoryTab } from './repository-tabs-state'

describe('normalizeRepositoryTab', () => {
  it('defaults to guide when no tab is specified', () => {
    expect(normalizeRepositoryTab(null)).toBe('guide')
  })

  it('maps old structure urls to guide', () => {
    expect(normalizeRepositoryTab('structure')).toBe('guide')
  })

  it('reserves files without showing it in normal tabs', () => {
    expect(normalizeRepositoryTab('files')).toBe('files')
    expect(getAvailableRepositoryTabs(true)).not.toContain('files')
  })
})

describe('getAvailableRepositoryTabs', () => {
  it('keeps documentation admin-only while showing guide to all users', () => {
    expect(getAvailableRepositoryTabs(true)).toEqual(['docs', 'guide', 'chat', 'settings'])
    expect(getAvailableRepositoryTabs(false)).toEqual(['guide', 'chat', 'settings'])
  })
})
