import { describe, expect, it } from 'vitest'
import { resolveMcpOAuthConfig } from './mcp-oauth.js'

describe('resolveMcpOAuthConfig', () => {
  it('defaults to disabled with no issuer required', () => {
    const config = resolveMcpOAuthConfig({})
    expect(config.enabled).toBe(false)
    expect(config.issuerUrl).toBeNull()
    expect(config.resourceUrl).toBeNull()
  })

  it('parses enabled=true and derives resource + web URLs', () => {
    const config = resolveMcpOAuthConfig({
      MCP_OAUTH_ENABLED: 'true',
      MCP_OAUTH_ISSUER_URL: 'https://convergekit.convergekit.dev',
      WEB_APP_URL: 'https://convergekit.convergekit.dev',
    })
    expect(config.enabled).toBe(true)
    expect(config.issuerUrl).toBe('https://convergekit.convergekit.dev')
    expect(config.resourceUrl).toBe('https://convergekit.convergekit.dev/api/mcp')
    expect(config.loginUrl).toBe('https://convergekit.convergekit.dev/auth/sign-in')
    expect(config.consentUrl).toBe('https://convergekit.convergekit.dev/mcp/consent')
  })

  it('strips a trailing slash from the issuer before deriving URLs', () => {
    const config = resolveMcpOAuthConfig({
      MCP_OAUTH_ENABLED: 'true',
      MCP_OAUTH_ISSUER_URL: 'https://convergekit.convergekit.dev/',
    })
    expect(config.issuerUrl).toBe('https://convergekit.convergekit.dev')
    expect(config.resourceUrl).toBe('https://convergekit.convergekit.dev/api/mcp')
  })

  it('treats an empty-string WEB_APP_URL as unset and falls back to the issuer', () => {
    const config = resolveMcpOAuthConfig({
      MCP_OAUTH_ENABLED: 'true',
      MCP_OAUTH_ISSUER_URL: 'https://convergekit.convergekit.dev',
      WEB_APP_URL: '',
    })
    expect(config.loginUrl).toBe('https://convergekit.convergekit.dev/auth/sign-in')
    expect(config.consentUrl).toBe('https://convergekit.convergekit.dev/mcp/consent')
  })

  it('throws a formatted error when MCP_OAUTH_ENABLED is not a valid enum value', () => {
    expect(() => resolveMcpOAuthConfig({ MCP_OAUTH_ENABLED: 'maybe' })).toThrow(
      /Invalid MCP OAuth configuration/,
    )
  })

  it('throws when enabled without an issuer URL', () => {
    expect(() => resolveMcpOAuthConfig({ MCP_OAUTH_ENABLED: 'true' })).toThrow(
      /MCP_OAUTH_ISSUER_URL is required/,
    )
  })

  it('throws when the issuer URL is not a valid URL', () => {
    expect(() =>
      resolveMcpOAuthConfig({ MCP_OAUTH_ENABLED: 'true', MCP_OAUTH_ISSUER_URL: 'not-a-url' }),
    ).toThrow(/must be a valid URL/)
  })
})
