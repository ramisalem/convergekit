import { describe, expect, it } from 'vitest'
import { readSource } from '../test/read-source'

describe('app shell layout', () => {
  it('lets the signed-in header span the viewport instead of floating in a centered max-width container', () => {
    const source = readSource('src/components/app-shell.tsx')

    expect(source).toContain('app-shell-header-inner')
    expect(source).toContain('ConvergeKitLogo')
    expect(source).toContain('w-full')
    expect(source).not.toContain('max-w-[88rem]')
    expect(source).not.toContain('mx-auto flex h-full max-w')
  })

  it('uses the shared project logo instead of a text-only badge', () => {
    const shellSource = readSource('src/components/app-shell.tsx')
    const logoSource = readSource('src/components/convergekit-logo.tsx')

    expect(shellSource).toContain('@/components/convergekit-logo')
    expect(shellSource).not.toContain('CK')
    expect(logoSource).toContain('ConvergeKitLogoMark')
    expect(logoSource).toContain('ConvergeKitLogo')
    expect(logoSource).toContain('C12.6 10.25 14.8 16 20.7 16')
  })
})
