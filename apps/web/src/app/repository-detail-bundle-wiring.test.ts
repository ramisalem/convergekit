import { describe, expect, it } from 'vitest'
import { readSource } from '../test/read-source'

describe('repository detail bundle wiring', () => {
  const detailSource = readSource('src/app/[locale]/repositories/[id]/page.tsx')
  const docsSource = readSource('src/components/repository-detail/docs-tab.tsx')

  it('lazy-loads heavy tab panes from the repository detail route', () => {
    expect(detailSource).toContain("import dynamic from 'next/dynamic'")
    expect(detailSource).toContain('dynamic(')
    expect(detailSource).toContain("import('@/components/repository-detail/docs-tab')")
    expect(detailSource).toContain("import('@/components/repository-detail/repo-guide-tab')")
    expect(detailSource).toContain("import('@/components/repository-detail/chat-tab')")
    expect(detailSource).toContain("import('@/components/repository-detail/settings-tab')")
    expect(detailSource).not.toContain(
      "import { DocsTab } from '@/components/repository-detail/docs-tab'",
    )
  })

  it('does not statically import the Shiki-backed CodeBlock in the docs tab', () => {
    expect(docsSource).toContain("import dynamic from 'next/dynamic'")
    expect(docsSource).toContain("import('@/components/ai-elements/code-block')")
    expect(docsSource).not.toContain(
      "import { CodeBlock } from '@/components/ai-elements/code-block'",
    )
  })
})
