import { readSource } from '../../test/read-source'
import { describe, expect, it } from 'vitest'

describe('repository settings role permissions', () => {
  it('shows MCP token controls to everyone with repo access but gates repository-wide actions to admins', () => {
    const detailSource = readSource('src/app/[locale]/repositories/[id]/page.tsx')
    const settingsSource = readSource('src/components/repository-detail/settings-tab.tsx')

    expect(detailSource).toContain('<SettingsTab')
    expect(detailSource).toContain('currentUserId={user?.id ?? null}')

    expect(settingsSource).toContain('isAdmin: boolean')
    expect(settingsSource).toContain('currentUserId: string | null')
    expect(settingsSource).toContain('{isAdmin && (')
    expect(settingsSource).toContain('{/* MCP Tokens section */}')
    expect(settingsSource.indexOf('{/* MCP Tokens section */}')).toBeLessThan(
      settingsSource.indexOf('{isAdmin && ('),
    )
  })

  it('prevents inactive MCP token rows from showing successful test state or running tests', () => {
    const settingsSource = readSource('src/components/repository-detail/settings-tab.tsx')

    expect(settingsSource).toContain("token.status === 'active' && result?.ok")
    expect(settingsSource).toContain("token.status !== 'active'")
  })

  it('surfaces admin-only MCP token owner visibility and filtering', () => {
    const apiClientSource = readSource('src/lib/api-client.ts')
    const settingsSource = readSource('src/components/repository-detail/settings-tab.tsx')

    expect(apiClientSource).toContain('McpTokenOwnerOption')
    expect(apiClientSource).toContain('owner: McpTokenOwnerOption')
    expect(apiClientSource).toContain('ownerUserId')

    expect(settingsSource).toContain('ownerFilterUserId')
    expect(settingsSource).toContain('ownerOptions')
    expect(settingsSource).toContain('Created by')
    expect(settingsSource).toContain('All token owners')
    expect(settingsSource).toContain('isAdmin && ownerOptions.length > 0')
  })
})
