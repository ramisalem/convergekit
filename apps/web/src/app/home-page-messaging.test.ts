import { describe, expect, it } from 'vitest'
import { readSource } from '../test/read-source'

const localizedHomeSource = readSource('src/app/[locale]/page.tsx')
const rootHomeSource = readSource('src/app/page.tsx')
const layoutSource = readSource('src/app/layout.tsx')
const messages = JSON.parse(readSource('messages/en.json')) as {
  home: Record<string, string>
}

describe('home page messaging', () => {
  it('positions ConvergeKit as the shared source of truth for aligned product work', () => {
    expect(messages.home.badge).toContain('Alignment for software teams')
    expect(messages.home.headline).toContain('shared source of truth')
    expect(messages.home.headline).toContain('product')
    expect(messages.home.headline).toContain('engineering')
    expect(messages.home.headline).toContain('AI agents')
    expect(messages.home.subheadline).toContain('Product managers')
    expect(messages.home.subheadline).toContain('engineers')
    expect(messages.home.subheadline).toContain('AI agents')
    expect(messages.home.feature1Title).toBe('For product managers')
    expect(messages.home.feature2Title).toBe('For engineers')
    expect(messages.home.feature3Title).toBe('For AI agents')
    expect(layoutSource).toContain('shared source of truth')
    expect(rootHomeSource).toContain('shared source of truth')
  })

  it('formats the localized landing page around alignment roles and workflow', () => {
    expect(localizedHomeSource).toContain('audienceCards')
    expect(localizedHomeSource).toContain('workflowSteps')
    expect(localizedHomeSource).toContain('For product')
    expect(localizedHomeSource).toContain('For engineers')
    expect(localizedHomeSource).toContain('For agents')
    expect(localizedHomeSource).toContain('ChevronRight')
    expect(localizedHomeSource).not.toContain('Understand any codebase, instantly')
  })
})
