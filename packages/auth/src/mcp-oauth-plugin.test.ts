import type { McpOAuthConfig } from '@convergekit/config/mcp-oauth'
import { describe, expect, it } from 'vitest'
import { buildMcpOAuthPlugins } from './mcp-oauth-plugin.js'

const enabledConfig: McpOAuthConfig = {
  enabled: true,
  issuerUrl: 'https://wiki.example.com',
  resourceUrl: 'https://wiki.example.com/api/mcp',
  loginUrl: 'https://wiki.example.com/auth/sign-in',
  consentUrl: 'https://wiki.example.com/mcp/consent',
}

describe('buildMcpOAuthPlugins', () => {
  it('returns no plugins when the feature is disabled', () => {
    const config: McpOAuthConfig = {
      enabled: false,
      issuerUrl: null,
      resourceUrl: null,
      loginUrl: null,
      consentUrl: null,
    }
    expect(buildMcpOAuthPlugins(config)).toEqual([])
  })

  it('mounts the mcp plugin when enabled with a login URL', () => {
    const result = buildMcpOAuthPlugins(enabledConfig)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('mcp')
  })

  it('returns no plugins when enabled but the login URL is missing', () => {
    const config: McpOAuthConfig = { ...enabledConfig, loginUrl: null }
    expect(buildMcpOAuthPlugins(config)).toEqual([])
  })
})
