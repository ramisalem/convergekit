import { readSource } from '../test/read-source'
import { describe, expect, it } from 'vitest'

describe('repository auth and loading states', () => {
  it('redirects unauthenticated repository list/detail access instead of rendering empty or fake indexing states', () => {
    const listSource = readSource('src/app/[locale]/repositories/page.tsx')
    const detailSource = readSource('src/app/[locale]/repositories/[id]/page.tsx')

    expect(listSource).toContain('if (err instanceof ApiError && err.status === 401)')
    expect(listSource).toContain("router.replace('/auth/sign-in')")
    expect(listSource).toContain('const [loading, setLoading] = useState(true)')

    expect(detailSource).toContain('if (err instanceof ApiError && err.status === 401)')
    expect(detailSource).toContain("router.replace('/auth/sign-in')")
    expect(detailSource).toContain('if (!repo && loading)')
  })

  it('redirects unauthenticated wiki SSR fetches to sign-in instead of falling through to 404', () => {
    const wikiIndexSource = readSource('src/app/[locale]/repositories/[id]/wiki/page.tsx')
    const wikiLayoutSource = readSource('src/app/[locale]/repositories/[id]/wiki/layout.tsx')
    const wikiSlugSource = readSource('src/app/[locale]/repositories/[id]/wiki/[slug]/page.tsx')

    expect(wikiIndexSource).toContain('if (res.status === 401) redirect')
    expect(wikiLayoutSource).toContain('if (res.status === 401) redirect')
    expect(wikiSlugSource).toContain('if (res.status === 401) redirect')
  })
})
