import { describe, expect, it } from 'vitest'
import { normalizeWikiMarkdown } from './normalize-wiki-markdown'

describe('normalizeWikiMarkdown', () => {
  it('strips whole-document markdown fences', () => {
    const input = '```markdown\n# Title\n\nBody\n```'

    expect(normalizeWikiMarkdown(input)).toBe('# Title\n\nBody')
  })

  it('normalizes plain text citations in Sources lines', () => {
    const input = 'Sources: src/auth/handler.ts:15-42, src/db/client.ts:8'

    expect(normalizeWikiMarkdown(input)).toBe(
      'Sources: [src/auth/handler.ts:15-42](), [src/db/client.ts:8]()',
    )
  })

  it('does not rewrite fenced code blocks or inline code spans', () => {
    const input = [
      '```ts',
      "const source = 'src/auth/handler.ts:15-42'",
      '```',
      '',
      'Inline `src/auth/handler.ts:15-42`',
      '',
      'Sources: src/db/client.ts:8-19',
    ].join('\n')

    const output = normalizeWikiMarkdown(input)

    expect(output).toContain("const source = 'src/auth/handler.ts:15-42'")
    expect(output).toContain('Inline `src/auth/handler.ts:15-42`')
    expect(output).toContain('Sources: [src/db/client.ts:8-19]()')
  })

  it('wraps obvious mermaid-like diagram text in mermaid fences', () => {
    const input = 'Diagram: graph TD API-->DB DB-->Worker'

    expect(normalizeWikiMarkdown(input)).toBe([
      'Diagram:',
      '```mermaid',
      'graph TD API-->DB DB-->Worker',
      '```',
    ].join('\n'))
  })
})
