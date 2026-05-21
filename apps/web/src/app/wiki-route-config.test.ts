import { readSource } from '../test/read-source'
import { describe, expect, it } from 'vitest'

describe('wiki route config', () => {
  it('marks the wiki index page as force-dynamic', () => {
    const source = readSource('src/app/[locale]/repositories/[id]/wiki/page.tsx')

    expect(source).toContain("export const dynamic = 'force-dynamic'")
  })

  it('uses the server API base URL for wiki SSR data fetches', () => {
    const files = [
      'src/app/[locale]/repositories/[id]/wiki/page.tsx',
      'src/app/[locale]/repositories/[id]/wiki/layout.tsx',
      'src/app/[locale]/repositories/[id]/wiki/[slug]/page.tsx',
    ]

    for (const file of files) {
      const source = readSource(file)

      expect(source).toContain("from '@/lib/runtime-urls'")
      expect(source).toContain('getApiBaseUrl(')
      expect(source).not.toContain('getWebBaseUrl(')
      expect(source).not.toContain("process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001'")
      expect(source).not.toContain('${WEB_URL}/api/')
      expect(source).not.toContain('${WEB_URL}${url}')
      expect(source.includes('${API_URL}/api/') || source.includes('${API_URL}${url}')).toBe(true)
    }
  })
})
