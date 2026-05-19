import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('document path queries', () => {
  it('excludes internal generated mindmap documents from user-facing document lists', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')

    expect(source).toContain("const INTERNAL_DOCUMENT_PATHS = ['__mindmap__']")
    expect(source).toContain('notInArray(documents.path, INTERNAL_DOCUMENT_PATHS)')
  })
})
