import { readSource } from '../../test/read-source'
import { describe, expect, it } from 'vitest'

describe('repository advanced settings layout', () => {
  it('matches the mockup card stack for tokens, maintenance, and danger actions', () => {
    const source = readSource('src/components/repository-detail/settings-tab.tsx')

    expect(source).toContain('settings-tab-shell')
    expect(source).toContain('w-full')
    expect(source).not.toContain('max-w-[68.75rem]')
    expect(source).toContain('gap-3.5')
    expect(source).not.toContain('px-[22px]')

    expect(source).toContain('grid-cols-1 gap-3.5 md:grid-cols-2')
    expect(source).toContain('Re-index repository')
    expect(source).toContain('Re-clone, parse, and embed everything from scratch.')
    expect(source).toContain('Regenerate Wiki')
    expect(source).toContain('Skip indexing; rebuild pages from current chunks.')

    expect(source).toContain('Danger zone')
    expect(source).toContain('border-[#fecaca]')
    expect(source).toContain('Deleting a repository removes all indexed data, wiki pages, chats, and tokens.')
  })
})
