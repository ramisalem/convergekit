import { describe, expect, it } from 'vitest'
import {
  buildInitialOpenSections,
  syncOpenSections,
  toggleOpenSection,
  type SectionLike,
} from './wiki-sidebar-state'

describe('wiki-sidebar-state', () => {
  const sections: SectionLike[] = [
    { slug: 'overview', pages: [{ slug: 'intro' }, { slug: 'architecture' }] },
    { slug: 'guides', pages: [{ slug: 'setup' }] },
  ]

  it('buildInitialOpenSections returns all sections open', () => {
    expect(buildInitialOpenSections(sections)).toEqual({
      overview: true,
      guides: true,
    })
  })

  it('toggleOpenSection toggles one section without mutating others', () => {
    const current = { overview: true, guides: false }

    const next = toggleOpenSection(current, 'overview')

    expect(next).toEqual({ overview: false, guides: false })
    expect(next).not.toBe(current)
    expect(current).toEqual({ overview: true, guides: false })
  })

  it('syncOpenSections preserves the current session state for existing sections', () => {
    expect(syncOpenSections(
      { overview: false, guides: true },
      [
        { slug: 'overview', pages: [{ slug: 'intro' }] },
        { slug: 'guides', pages: [{ slug: 'setup' }] },
        { slug: 'reference', pages: [{ slug: 'api' }] },
      ],
    )).toEqual({
      overview: false,
      guides: true,
      reference: true,
    })
  })
})
