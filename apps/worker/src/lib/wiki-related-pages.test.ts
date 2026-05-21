import { describe, expect, it } from 'vitest'
import { linkRelatedPages } from './wiki-related-pages.js'

describe('linkRelatedPages', () => {
  it('links known child wiki page titles in the Related Pages section', () => {
    const input = [
      '# Architecture',
      '',
      '## Related Pages',
      '- Indexing Pipeline',
      '- Wiki Generation',
      '- Overview',
    ].join('\n')

    expect(
      linkRelatedPages(input, [
        { title: 'Indexing Pipeline', slug: 'indexing-pipeline' },
        { title: 'Wiki Generation', slug: 'wiki-generation' },
      ]),
    ).toBe([
      '# Architecture',
      '',
      '## Related Pages',
      '- [Indexing Pipeline](indexing-pipeline)',
      '- [Wiki Generation](wiki-generation)',
      '- Overview',
    ].join('\n'))
  })

  it('does not nest existing related page links', () => {
    const input = [
      '## Related Pages',
      '- [Indexing Pipeline](indexing-pipeline)',
      '- [Wiki Generation]()',
    ].join('\n')

    expect(
      linkRelatedPages(input, [
        { title: 'Indexing Pipeline', slug: 'indexing-pipeline' },
        { title: 'Wiki Generation', slug: 'wiki-generation' },
      ]),
    ).toBe([
      '## Related Pages',
      '- [Indexing Pipeline](indexing-pipeline)',
      '- [Wiki Generation](wiki-generation)',
    ].join('\n'))
  })

  it('can link a section-title alias to a generated child page', () => {
    const input = [
      '## Related Pages',
      '- Authentication and User Management',
      '- Story Generation System',
    ].join('\n')

    expect(
      linkRelatedPages(input, [
        { title: 'Authentication and User Management', slug: 'authentication-components' },
        { title: 'Generate Story Function', slug: 'generate-story-function' },
      ]),
    ).toBe([
      '## Related Pages',
      '- [Authentication and User Management](authentication-components)',
      '- [Story Generation System](generate-story-function)',
    ].join('\n'))
  })
})
