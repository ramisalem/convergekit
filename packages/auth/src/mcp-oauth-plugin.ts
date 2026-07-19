import type { McpOAuthConfig } from '@convergekit/config/mcp-oauth'
import { mcp } from 'better-auth/plugins'

// Build the MCP OAuth plugin list for better-auth — DCR + client table only; our own
// authorize/token/consent/well-known own everything else. Returns [] when the feature is
// dark, so the plugin (and its always-on after-hook) is never mounted.
export function buildMcpOAuthPlugins(config: McpOAuthConfig) {
  if (!config.enabled || !config.loginUrl) return []
  const loginPage = config.loginUrl
  return [
    mcp({
      loginPage,
      oidcConfig: { loginPage, scopes: ['repo:read', 'docs:search', 'files:read'] },
    }),
  ]
}
