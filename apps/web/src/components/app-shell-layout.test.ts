import { describe, expect, it } from 'vitest'
import { readSource } from '../test/read-source'

describe('app shell layout', () => {
  it('lets the signed-in header span the viewport instead of floating in a centered max-width container', () => {
    const source = readSource('src/components/app-shell.tsx')

    expect(source).toContain('app-shell-header-inner')
    expect(source).toContain('w-full')
    expect(source).not.toContain('max-w-[88rem]')
    expect(source).not.toContain('mx-auto flex h-full max-w')
  })
})
