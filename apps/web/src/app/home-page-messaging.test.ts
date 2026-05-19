import { readSource } from '../test/read-source'
import { describe, expect, it } from 'vitest'

const localizedHomeSource = readSource('src/app/[locale]/page.tsx')
const rootHomeSource = readSource('src/app/page.tsx')
const layoutSource = readSource('src/app/layout.tsx')
const messages = JSON.parse(readSource('messages/en.json')) as {
  home: Record<string, string>
}

describe('home page messaging', () => {
  it('positions ConvergeKit around product, engineering, and agent alignment', () => {
    expect(messages.home.badge).toContain('Alignment infrastructure')
    expect(messages.home.headline).toContain('product intent')
    expect(messages.home.headline).toContain('code reality')
    expect(messages.home.headline).toContain('agent context')
    expect(messages.home.subheadline).toContain('product teams')
    expect(messages.home.subheadline).toContain('engineers')
    expect(messages.home.subheadline).toContain('AI agents')
    expect(messages.home.feature1Title).toBe('Ground decisions in code')
    expect(messages.home.feature2Title).toBe('Onboard in hours, not weeks')
    expect(messages.home.feature3Title).toBe('Same map, programmatic access')
    expect(layoutSource).toContain('product intent')
    expect(rootHomeSource).toContain('product intent')
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
