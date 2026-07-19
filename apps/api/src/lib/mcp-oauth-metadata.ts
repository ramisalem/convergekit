import { CANONICAL_OAUTH_SCOPES } from './mcp-oauth-policy.js'

export function buildAuthorizationServerMetadata(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/api/mcp-oauth/authorize`,
    token_endpoint: `${issuer}/api/mcp-oauth/token`,
    registration_endpoint: `${issuer}/api/auth/mcp/register`,
    scopes_supported: CANONICAL_OAUTH_SCOPES,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
  }
}

export function buildProtectedResourceMetadata(issuer: string, resource: string) {
  return {
    resource,
    authorization_servers: [issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: CANONICAL_OAUTH_SCOPES,
  }
}
