import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('repository documentation tab visibility', () => {
  it('keeps the documentation tab admin-only and falls users back to repo guide', () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
    const source = readFileSync(
      join(repoRoot, 'apps/web/src/app/[locale]/repositories/[id]/page.tsx'),
      'utf8',
    )

    expect(source).toContain('getAvailableRepositoryTabs')
    expect(source).toContain('getEffectiveRepositoryTab')
    expect(source).toContain('normalizeRepositoryTab')
    expect(source).toContain('{availableTabs.map((tab) => (')
    expect(source).toContain("effectiveActiveTab === 'docs'")
    expect(source).toContain("effectiveActiveTab === 'guide'")
  })
})
