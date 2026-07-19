import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('repository detail incremental header strip', () => {
  const source = readFileSync(
    new URL('./[locale]/repositories/[id]/page.tsx', import.meta.url),
    'utf8',
  )

  it('renders the read-only strip from the header summary', () => {
    expect(source).toContain('formatHeaderIncrementalStrip')
    expect(source).toContain('repo?.incrementalIndexing')
  })

  it('does not put admin action buttons in the header strip', () => {
    const headerBlock = source.slice(
      source.indexOf('repository-detail-header-grid'),
      source.indexOf('Tabs + Wiki link'),
    )
    expect(headerBlock).not.toContain('checkIncrementalNow')
    expect(headerBlock).not.toContain('pauseIncremental')
  })
})
