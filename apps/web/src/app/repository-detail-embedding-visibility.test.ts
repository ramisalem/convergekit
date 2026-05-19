import { readSource } from '../test/read-source'
import { describe, expect, it } from 'vitest'

describe('repository detail embedding mismatch visibility', () => {
  it('keeps embedding mismatch warnings and reindex controls admin-only', () => {
    const source = readSource('src/app/[locale]/repositories/[id]/page.tsx')

    expect(source).toContain("import { useUser } from '@/components/user-nav'")
    expect(source).toContain("const isAdmin = user?.role === 'admin'")
    expect(source).toContain('isAdmin && embeddingCompatibility')
    expect(source).toContain('compatibility={isAdmin ? embeddingCompatibility : null}')
  })
})
