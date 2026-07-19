import { describe, expect, it } from 'vitest'
import { readSource } from '../../test/read-source'

describe('repository settings role permissions', () => {
  it('has no token controls; points users at their own account tokens and Connect your agent', () => {
    const settingsSource = readSource('src/components/repository-detail/settings-tab.tsx')

    expect(settingsSource).not.toContain('mcp-tokens')
    expect(settingsSource).not.toContain('McpToken')
    expect(settingsSource).not.toContain('renewMcpToken')
    expect(settingsSource).not.toContain('ciTokensApi')
    expect(settingsSource).not.toContain('CI / automation tokens are managed by admins in Settings')
    expect(settingsSource).toContain('/account/ci-tokens')
    expect(settingsSource).toContain('/account/agents')
    expect(settingsSource).toContain('{isAdmin && (')
  })

  it('repository-wide actions stay admin-gated', () => {
    const detailSource = readSource('src/app/[locale]/repositories/[id]/page.tsx')
    const settingsSource = readSource('src/components/repository-detail/settings-tab.tsx')
    expect(detailSource).toContain('<SettingsTab')
    expect(settingsSource).toContain('isAdmin: boolean')
  })
})
