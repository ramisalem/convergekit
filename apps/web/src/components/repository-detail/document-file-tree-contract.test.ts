import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const docsTabSource = readFileSync(new URL('./docs-tab.tsx', import.meta.url), 'utf8')
const fileTreeSource = readFileSync(new URL('./document-file-tree.tsx', import.meta.url), 'utf8')
const messagesSource = readFileSync(new URL('../../../messages/en.json', import.meta.url), 'utf8')

describe('document file tree contract', () => {
  it('renames the documentation tab to File Structure', () => {
    expect(messagesSource).toContain('"docs": "File Structure"')
    expect(messagesSource).not.toContain('"docs": "Documentation"')
  })

  it('uses a searchable selectable tree instead of a flat file column', () => {
    expect(docsTabSource).toContain('<DocumentFileTree')
    expect(docsTabSource).toContain('query={docQuery}')
    expect(docsTabSource).toContain('selectedPath={selectedPath}')
    expect(docsTabSource).toContain('onSelect={setSelectedPath}')
    expect(docsTabSource).not.toContain('filteredDocs.map((doc)')
    expect(fileTreeSource).toContain('buildDocumentTree')
    expect(fileTreeSource).toContain('filterDocumentTree')
    expect(fileTreeSource).toContain('FolderOpen')
    expect(fileTreeSource).toContain('Folder')
    expect(fileTreeSource).toContain('FileText')
    expect(fileTreeSource).toContain('aria-label={`Select ${node.path}`}')
  })
})
