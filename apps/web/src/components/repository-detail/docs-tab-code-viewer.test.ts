import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const docsTabSource = readFileSync(new URL('./docs-tab.tsx', import.meta.url), 'utf8')
const fileTreeSource = readFileSync(new URL('./document-file-tree.tsx', import.meta.url), 'utf8')
const globalsCssSource = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')

describe('docs tab code viewer', () => {
  it('renders selected document content through the syntax-highlighted code block when possible', () => {
    expect(docsTabSource).toContain('@/components/ai-elements/code-block')
    expect(docsTabSource).toContain('getDocumentCodeLanguage')
    expect(docsTabSource).toContain('selectedDocLanguage')
    expect(docsTabSource).toContain('<CodeBlock')
    expect(docsTabSource).toContain('code={selectedDoc.content}')
    expect(docsTabSource).toContain('language={selectedDocLanguage}')
    expect(docsTabSource).toContain('showLineNumbers')
    expect(docsTabSource).not.toContain(
      '<pre className="flex-1 overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-xs leading-relaxed text-[var(--convergekit-ink-2)]">',
    )
  })

  it('keeps the highlighted selected file scrolled inside the document pane', () => {
    expect(docsTabSource).toContain('h-[calc(100vh_-_16rem)]')
    expect(docsTabSource).toContain('min-h-[640px]')
    expect(docsTabSource).toContain('document-code-viewer')
    expect(fileTreeSource).toContain('min-h-0 flex-1 space-y-0.5 overflow-y-auto')
    expect(globalsCssSource).toContain('.document-code-viewer')
    expect(globalsCssSource).toContain('.document-code-viewer > .relative')
    expect(globalsCssSource).toContain('overflow: auto')
    expect(globalsCssSource).toContain('white-space: pre')
  })
})
