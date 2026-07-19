import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const indexSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
const pluginSource = readFileSync(new URL('./mcp-oauth-plugin.ts', import.meta.url), 'utf8')

describe('mcp oauth plugin registration', () => {
  it('wires the kill-switch config and the plugin builder into index.ts', () => {
    expect(indexSource).toContain('resolveMcpOAuthConfig')
    expect(indexSource).toContain('buildMcpOAuthPlugins')
  })

  it('builds the mcp plugin from the kill-switch config in the helper', () => {
    expect(pluginSource).toContain("from 'better-auth/plugins'")
    expect(pluginSource).toContain('mcp(')
  })

  it('registers the DCR tables in the drizzle adapter schema', () => {
    expect(indexSource).toContain('oauthApplication')
    expect(indexSource).toContain('oauthAccessToken')
    expect(indexSource).toContain('oauthConsent')
  })
})
