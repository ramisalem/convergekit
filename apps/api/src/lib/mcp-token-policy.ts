import { createHash, randomBytes } from 'node:crypto'

export const ALL_MCP_SCOPES = ['repo:read', 'docs:search', 'files:read'] as const

export type McpScope = (typeof ALL_MCP_SCOPES)[number]
export type McpTokenStatus = 'active' | 'expired' | 'revoked'

const MCP_SCOPE_SET = new Set<string>(ALL_MCP_SCOPES)
const MCP_TOOL_BY_SCOPE: Record<McpScope, string> = {
  'repo:read': 'get_structure',
  'docs:search': 'search_docs',
  'files:read': 'read_file',
}
const SUPPORTED_EXPIRY_DAYS = new Set([7, 30, 90])
const DEFAULT_EXPIRY_DAYS = 30

export function hashMcpToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

export function fingerprintMcpTokenHash(tokenHash: string): string {
  return `cw_${tokenHash.slice(0, 8)}.${tokenHash.slice(-4)}`
}

export function createMcpTokenSecret(): {
  rawToken: string
  tokenHash: string
  fingerprint: string
} {
  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = hashMcpToken(rawToken)
  return {
    rawToken,
    tokenHash,
    fingerprint: fingerprintMcpTokenHash(tokenHash),
  }
}

export function resolveMcpTokenExpiry(days: number | undefined, now = new Date()): Date {
  const expiryDays = days ?? DEFAULT_EXPIRY_DAYS
  if (!SUPPORTED_EXPIRY_DAYS.has(expiryDays)) {
    throw new Error('Unsupported MCP token expiry')
  }

  const expiresAt = new Date(now)
  expiresAt.setUTCDate(expiresAt.getUTCDate() + expiryDays)
  return expiresAt
}

export function normalizeMcpScopes(scopes: string[] | undefined): McpScope[] {
  if (!scopes || scopes.length === 0) return [...ALL_MCP_SCOPES]

  const normalized: McpScope[] = []
  for (const scope of scopes) {
    if (!MCP_SCOPE_SET.has(scope)) throw new Error('Unsupported MCP token scope')
    if (!normalized.includes(scope as McpScope)) normalized.push(scope as McpScope)
  }
  return normalized
}

export function getMcpTokenStatus(
  token: { expiresAt: Date; revokedAt: Date | null },
  now = new Date(),
): McpTokenStatus {
  if (token.revokedAt) return 'revoked'
  if (token.expiresAt <= now) return 'expired'
  return 'active'
}

export function getMcpConnectionTestBlockReason(
  token: { expiresAt: Date; revokedAt: Date | null },
  now = new Date(),
): string | null {
  const status = getMcpTokenStatus(token, now)
  if (status === 'revoked') return 'MCP token is revoked. Renew it before testing.'
  if (status === 'expired') return 'MCP token is expired. Renew it before testing.'
  return null
}

export function expectedMcpToolsForScopes(scopes: readonly McpScope[]) {
  return scopes.map((scope) => MCP_TOOL_BY_SCOPE[scope])
}

export function mcpToolsForScopes(scopes: readonly McpScope[]) {
  return {
    getStructure: scopes.includes('repo:read'),
    searchDocs: scopes.includes('docs:search'),
    readFile: scopes.includes('files:read'),
  }
}
