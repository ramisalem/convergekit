import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const docsTabSource = readFileSync(new URL('./docs-tab.tsx', import.meta.url), 'utf8')
const repositoryDetailPageSource = readFileSync(
  new URL('../../app/[locale]/repositories/[id]/page.tsx', import.meta.url),
  'utf8',
)

describe('docs tab layout contract', () => {
  it('uses the same internal repository workspace frame as chat', () => {
    expect(repositoryDetailPageSource).toContain(
      'repository-detail-workspace-frame mx-auto w-full max-w-[1500px] px-5 py-8',
    )
    expect(repositoryDetailPageSource).toContain('repository-detail-chrome')
    expect(repositoryDetailPageSource).toContain('repository-detail-tab-frame')
    expect(repositoryDetailPageSource).not.toContain('repository-detail-rail-chrome')
    expect(repositoryDetailPageSource).not.toContain('max-w-none px-0 pb-0')
  })

  it('docks the file explorer left and centers the selected file in a wide middle canvas', () => {
    expect(docsTabSource).toContain('file-structure-pane-grid')
    expect(docsTabSource).toContain("gridTemplateColumns: '320px minmax(0,1fr)'")
    expect(docsTabSource).toContain('h-[calc(100vh_-_16rem)]')
    expect(docsTabSource).toContain('min-h-[640px]')
    expect(docsTabSource).toContain('w-full')
    expect(docsTabSource).toContain('file-structure-rail')
    expect(docsTabSource).toContain('file-structure-center-column')
    expect(docsTabSource).toContain('max-w-[64rem]')
    expect(docsTabSource).not.toContain(
      'rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white p-3 lg:grid-cols-[260px_minmax(0,1fr)]',
    )
  })
})
