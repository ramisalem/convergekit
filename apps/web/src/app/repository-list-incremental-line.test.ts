import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('repository list incremental freshness line', () => {
  const source = readFileSync(new URL('./[locale]/repositories/page.tsx', import.meta.url), 'utf8')

  it('renders a freshness line from the incremental summary', () => {
    expect(source).toContain('formatRepositoryListFreshnessLine')
    expect(source).toContain('incrementalIndexing')
  })

  it('keeps the line secondary (ink-4) and omits it when null', () => {
    expect(source).toContain('convergekit-ink-4')
  })
})
