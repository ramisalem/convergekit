import { describe, expect, it } from 'vitest'
import { readSource } from '../test/read-source'

describe('repository list layout', () => {
  it('keeps repository filters as a compact toolbar above the rows', () => {
    const source = readSource('src/app/[locale]/repositories/page.tsx')

    expect(source).toContain('max-w-[1100px]')
    expect(source).toContain('flex w-full flex-wrap items-center gap-2')
    expect(source).toContain('relative min-w-64 flex-1')
    expect(source).toContain('placeholder="Search repositories"')
    expect(source).toContain('h-9 shrink-0 appearance-none rounded-md')
    expect(source).not.toContain('w-full rounded-md border border-[var(--convergekit-line)] bg-white px-3 text-sm text-[var(--convergekit-ink-2)]')
    expect(source).not.toContain('sm:w-auto')
    expect(source).not.toContain('rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white p-3 md:flex-row')
  })

  it('renders mockup-style repository rows with summary metadata inside one list card', () => {
    const source = readSource('src/app/[locale]/repositories/page.tsx')

    expect(source).toContain('formatCompactLoc')
    expect(source).toContain('repo.listSummary?.primaryLanguage')
    expect(source).toContain('repo.listSummary?.loc')
    expect(source).toContain('repo.listSummary?.chatCount')
    expect(source).toContain('repo.listSummary?.indexedAt ?? repo.indexedAt')
    expect(source).toContain('grid-cols-[28px_minmax(0,1.5fr)_minmax(0,1fr)_auto_auto]')
    expect(source).toContain('min-w-0 flex flex-col gap-0.5')
    expect(source).toContain('text-right text-[12.5px] text-[var(--convergekit-ink-3)]')
    expect(source).toContain('filteredRepositories.length > 0 ?')
    expect(source).toContain('overflow-hidden rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white')
    expect(source).not.toContain('hidden min-w-0')
    expect(source).not.toContain('hidden text-right')
    expect(source).not.toContain('space-y-3')
  })
})
