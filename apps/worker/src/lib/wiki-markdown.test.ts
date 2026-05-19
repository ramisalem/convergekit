import { describe, expect, it } from 'vitest'
import { sanitizeGeneratedWikiContent } from './wiki-markdown'

describe('sanitizeGeneratedWikiContent', () => {
  it('strips whole-document markdown fences from generated content', () => {
    const output = sanitizeGeneratedWikiContent('```markdown\n# Title\n\nBody\n```')

    expect(output).toBe('# Title\n\nBody')
  })

  it('throws when the generated content is empty after cleanup', () => {
    expect(() => sanitizeGeneratedWikiContent('```markdown\n\n```')).toThrow(
      'Wiki generation returned empty content',
    )
  })
})
