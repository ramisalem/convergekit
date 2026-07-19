import { describe, expect, it } from 'vitest'
import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
} from './mcp-oauth-metadata.js'

const issuer = 'https://convergekit.convergekit.dev'
const resource = 'https://convergekit.convergekit.dev/api/mcp'

describe('oauth discovery metadata', () => {
  it('AS metadata points only at our endpoints and omits id_token machinery', () => {
    const md = buildAuthorizationServerMetadata(issuer)
    expect(md.issuer).toBe(issuer)
    expect(md.authorization_endpoint).toBe(`${issuer}/api/mcp-oauth/authorize`)
    expect(md.token_endpoint).toBe(`${issuer}/api/mcp-oauth/token`)
    expect(md.registration_endpoint).toBe(`${issuer}/api/auth/mcp/register`)
    expect(md.code_challenge_methods_supported).toEqual(['S256'])
    expect(md.scopes_supported).toContain('offline_access')
    expect(md.scopes_supported).toContain('repo:read')
    expect(md).not.toHaveProperty('userinfo_endpoint')
    expect(md).not.toHaveProperty('jwks_uri')
    expect(md).not.toHaveProperty('id_token_signing_alg_values_supported')
  })

  it('protected-resource metadata advertises the issuer as the AS', () => {
    const md = buildProtectedResourceMetadata(issuer, resource)
    expect(md.resource).toBe(resource)
    expect(md.authorization_servers).toEqual([issuer])
    expect(md.bearer_methods_supported).toEqual(['header'])
  })
})
