import { logger } from '../logger.js'

export type McpOAuthEventName =
  | 'client_registered'
  | 'consent_granted'
  | 'consent_denied'
  | 'token_issued'
  | 'token_refreshed'
  | 'token_revoked'

export type McpOAuthEventFields = {
  userId?: string
  clientId?: string
  familyId?: string
  grantId?: string
  initiator?: 'user' | 'deactivation' | 'reuse_detection'
}

export function emitMcpOAuthEvent(name: McpOAuthEventName, fields: McpOAuthEventFields): void {
  logger.info({ event: `mcp.oauth.${name}`, ...fields }, 'mcp oauth event')
}
