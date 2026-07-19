import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('DocsTab indexing failure message', () => {
  it('renders the persisted indexing failure when there is no live job error', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/repository-detail/docs-tab.tsx'),
      'utf8',
    )
    const pageSource = readFileSync(
      join(process.cwd(), 'src/app/[locale]/repositories/[id]/page.tsx'),
      'utf8',
    )

    expect(source).toContain('indexingFailure?: { message: string } | null')
    expect(source).toContain('const failureMessage = jobError ?? indexingFailure?.message')
    expect(pageSource).toContain('indexingFailure={repo?.indexingFailure ?? null}')
  })
})
