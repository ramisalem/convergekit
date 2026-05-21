import { describe, expect, it } from 'vitest'
import { readSource } from '../../test/read-source'

describe('wiki rendering boundary', () => {
  it('keeps ConvergeKit wiki rendering out of Fumadocs and Tailwind Typography chrome', () => {
    const wikiPageContentSource = readSource('src/components/wiki/wiki-page-content.tsx')
    const wikiTocSource = readSource('src/components/wiki/wiki-toc.tsx')
    const globalsSource = readSource('src/app/globals.css')

    expect(wikiPageContentSource).toContain('wiki-content')
    expect(globalsSource).toContain('.wiki-content')
    expect(wikiPageContentSource).not.toContain('prose ')
    expect(wikiPageContentSource).not.toContain("from 'fumadocs-ui")
    expect(wikiTocSource).not.toContain("from 'fumadocs-ui")
  })

  it('lets rendered Mermaid diagrams open in a larger reader dialog', () => {
    const mermaidDiagramSource = readSource('src/components/wiki/mermaid-diagram.tsx')

    expect(mermaidDiagramSource).toContain('Open diagram')
    expect(mermaidDiagramSource).toContain('role="dialog"')
    expect(mermaidDiagramSource).toContain('aria-modal="true"')
    expect(mermaidDiagramSource).toContain('mermaid-diagram-modal')
  })
})
