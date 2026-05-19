import { describe, expect, it } from 'vitest'
import { readSource } from '../test/read-source'

describe('ConvergeKit design token cascade', () => {
  it('defines ConvergeKit tokens after imported Tailwind and Fumadocs styles', () => {
    const source = readSource('src/app/globals.css')
    const fumadocsImportIndex = source.indexOf("@import 'fumadocs-ui/style.css'")
    const tokenIndex = source.indexOf('--convergekit-bg: #ffffff')

    expect(fumadocsImportIndex).toBeGreaterThanOrEqual(0)
    expect(tokenIndex).toBeGreaterThan(fumadocsImportIndex)
    expect(source).toContain('--convergekit-ink: #0e1116')
    expect(source).toContain('background-color: var(--convergekit-bg-2)')
  })
})
