import { readSource } from '../../test/read-source'
import { describe, expect, it } from 'vitest'

describe('users row action menu positioning', () => {
  it('positions the popout from the trigger viewport rect instead of the clipped table row', () => {
    const source = readSource('src/components/settings/users-panel.tsx')

    expect(source).toContain('getBoundingClientRect')
    expect(source).toContain('window.innerWidth')
    expect(source).toContain("position: 'fixed'")
    expect(source).not.toContain('absolute right-0 top-full')
  })
})
