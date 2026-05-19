import { describe, expect, it } from 'vitest'
import { readSource } from '../../test/read-source'

describe('ClientTime', () => {
  it('formats after mount and preserves ISO markup for hydration', () => {
    const source = readSource('src/components/ui/client-time.tsx')

    expect(source).toContain("'use client'")
    expect(source).toContain('useEffect')
    expect(source).toContain('<time dateTime={iso}>')
    expect(source).toContain('label ?? iso')
  })
})
