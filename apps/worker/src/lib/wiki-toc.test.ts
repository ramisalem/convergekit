import { describe, expect, it } from 'vitest'
import { withUniqueSlugs } from './wiki-toc.js'

function page(slug: string) {
  return { slug, title: slug, orderIndex: 0, summary: '' }
}

describe('withUniqueSlugs', () => {
  it('leaves a table of contents with unique slugs unchanged', () => {
    const toc = { sections: [{ ...page('overview'), pages: [page('setup'), page('usage')] }] }
    expect(withUniqueSlugs(toc)).toEqual(toc)
  })

  it('renames a page that reuses its section slug', () => {
    const toc = { sections: [{ ...page('architecture'), pages: [page('architecture')] }] }
    const result = withUniqueSlugs(toc)
    expect(result.sections[0]!.slug).toBe('architecture')
    expect(result.sections[0]!.pages.map((p) => p.slug)).toEqual(['architecture-2'])
  })

  it('renames repeats across sections and skips suffixes already taken', () => {
    const toc = {
      sections: [
        { ...page('subsystems'), pages: [page('subsystems-2')] },
        { ...page('api'), pages: [page('subsystems'), page('subsystems')] },
      ],
    }
    const slugs = withUniqueSlugs(toc).sections.flatMap((s) => [
      s.slug,
      ...s.pages.map((p) => p.slug),
    ])
    expect(slugs).toEqual(['subsystems', 'subsystems-2', 'api', 'subsystems-3', 'subsystems-4'])
  })
})
