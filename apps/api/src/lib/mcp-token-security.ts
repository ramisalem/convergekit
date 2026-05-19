import {
  db,
  mcpTokenAlerts,
  mcpTokenAuditEvents,
  mcpTokens,
  session,
  type McpToken,
} from '@convergekit/db'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { Context } from 'hono'
import type { McpScope } from './mcp-token-policy.js'
import { scopedRepositoryIds } from './scoping.js'

export type McpTokenContext = Pick<
  McpToken,
  | 'id'
  | 'repositoryId'
  | 'userId'
  | 'label'
  | 'fingerprint'
  | 'scopes'
  | 'lastUsedIp'
  | 'lastUsedUserAgent'
  | 'lastUsedClientName'
  | 'lastUsedToolName'
>

export type McpAuditStatus = 'success' | 'failure' | 'rate_limited'

export function clientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown'
}

export function normalizeContextScopes(scopes: string[]): McpScope[] {
  return scopes.filter((scope): scope is McpScope =>
    ['repo:read', 'docs:search', 'files:read'].includes(scope),
  )
}

export async function recordMcpAuditEvent(input: {
  token: McpTokenContext
  clientLabel?: string | null
  clientName?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  method: string
  toolName?: string | null
  latencyMs: number
  status: McpAuditStatus
  statusCode?: number | null
  errorCode?: string | null
}) {
  await db
    .insert(mcpTokenAuditEvents)
    .values({
      tokenId: input.token.id,
      repositoryId: input.token.repositoryId,
      userId: input.token.userId,
      tokenLabel: input.token.label,
      tokenFingerprint: input.token.fingerprint,
      clientLabel: input.clientLabel ?? null,
      clientName: input.clientName ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      method: input.method,
      toolName: input.toolName ?? null,
      latencyMs: input.latencyMs,
      status: input.status,
      statusCode: input.statusCode ?? null,
      errorCode: input.errorCode ?? null,
    })
    .catch(() => undefined)
}

export async function touchMcpTokenUsage(input: {
  token: McpTokenContext
  ipAddress: string
  userAgent: string | null
  clientName: string | null
  toolName: string | null
}) {
  await db
    .update(mcpTokens)
    .set({
      lastUsedAt: new Date(),
      lastUsedIp: input.ipAddress,
      lastUsedUserAgent: input.userAgent,
      lastUsedClientName: input.clientName ?? input.token.lastUsedClientName,
      lastUsedToolName: input.toolName ?? input.token.lastUsedToolName,
    })
    .where(eq(mcpTokens.id, input.token.id))
    .catch(() => undefined)
}

export async function raiseMcpTokenAlert(input: {
  token: McpTokenContext
  kind: string
  message: string
  details?: string | null
}) {
  const existing = await db.query.mcpTokenAlerts
    .findFirst({
      where: and(
        eq(mcpTokenAlerts.tokenId, input.token.id),
        eq(mcpTokenAlerts.kind, input.kind),
        eq(mcpTokenAlerts.status, 'open'),
      ),
    })
    .catch(() => null)

  if (existing) {
    await db
      .update(mcpTokenAlerts)
      .set({ lastSeenAt: new Date(), details: input.details ?? existing.details })
      .where(eq(mcpTokenAlerts.id, existing.id))
      .catch(() => undefined)
    return
  }

  await db
    .insert(mcpTokenAlerts)
    .values({
      tokenId: input.token.id,
      repositoryId: input.token.repositoryId,
      userId: input.token.userId,
      kind: input.kind,
      message: input.message,
      details: input.details ?? null,
    })
    .catch(() => undefined)
}

export async function raiseSuspiciousUseAlerts(input: {
  token: McpTokenContext
  ipAddress: string
  userAgent: string | null
}) {
  if (input.token.lastUsedIp && input.token.lastUsedIp !== input.ipAddress) {
    await raiseMcpTokenAlert({
      token: input.token,
      kind: 'ip_changed',
      message: 'This token was used from a new IP address.',
      details: `${input.token.lastUsedIp} -> ${input.ipAddress}`,
    })
  }

  if (
    input.userAgent &&
    input.token.lastUsedUserAgent &&
    input.token.lastUsedUserAgent !== input.userAgent
  ) {
    await raiseMcpTokenAlert({
      token: input.token,
      kind: 'user_agent_changed',
      message: 'This token was used from a new user agent.',
      details: `${input.token.lastUsedUserAgent} -> ${input.userAgent}`,
    })
  }
}

export async function revokeActiveMcpTokensForUser(
  userId: string,
  revokedReason: string,
): Promise<number> {
  const revoked = await db
    .update(mcpTokens)
    .set({ revokedAt: new Date(), revokedReason })
    .where(and(eq(mcpTokens.userId, userId), isNull(mcpTokens.revokedAt)))
    .returning({ id: mcpTokens.id })
  return revoked.length
}

export async function revokeActiveMcpTokensForUsers(
  userIds: string[],
  revokedReason: string,
): Promise<number> {
  if (userIds.length === 0) return 0
  const revoked = await db
    .update(mcpTokens)
    .set({ revokedAt: new Date(), revokedReason })
    .where(and(inArray(mcpTokens.userId, userIds), isNull(mcpTokens.revokedAt)))
    .returning({ id: mcpTokens.id })
  return revoked.length
}

export async function revokeActiveMcpTokensForRepository(
  repositoryId: string,
  revokedReason: string,
): Promise<number> {
  const revoked = await db
    .update(mcpTokens)
    .set({ revokedAt: new Date(), revokedReason })
    .where(and(eq(mcpTokens.repositoryId, repositoryId), isNull(mcpTokens.revokedAt)))
    .returning({ id: mcpTokens.id })
  return revoked.length
}

export async function revokeActiveMcpTokensForUsersAndRepository(
  userIds: string[],
  repositoryId: string,
  revokedReason: string,
): Promise<number> {
  if (userIds.length === 0) return 0
  const revoked = await db
    .update(mcpTokens)
    .set({ revokedAt: new Date(), revokedReason })
    .where(
      and(
        inArray(mcpTokens.userId, userIds),
        eq(mcpTokens.repositoryId, repositoryId),
        isNull(mcpTokens.revokedAt),
      ),
    )
    .returning({ id: mcpTokens.id })
  return revoked.length
}

export async function revokeMcpTokensNoLongerAllowed(
  userIds: string[],
  revokedReason: string,
): Promise<number> {
  if (userIds.length === 0) return 0

  const activeTokens = await db
    .select({ id: mcpTokens.id, userId: mcpTokens.userId, repositoryId: mcpTokens.repositoryId })
    .from(mcpTokens)
    .where(and(inArray(mcpTokens.userId, userIds), isNull(mcpTokens.revokedAt)))

  let revoked = 0
  for (const userId of new Set(activeTokens.map((token) => token.userId))) {
    const allowed = await scopedRepositoryIds(userId)
    const revokeIds = activeTokens
      .filter((token) => token.userId === userId && !allowed.has(token.repositoryId))
      .map((token) => token.id)

    if (revokeIds.length === 0) continue

    const rows = await db
      .update(mcpTokens)
      .set({ revokedAt: new Date(), revokedReason })
      .where(inArray(mcpTokens.id, revokeIds))
      .returning({ id: mcpTokens.id })
    revoked += rows.length
  }

  return revoked
}

export async function deleteSessionsForUser(userId: string): Promise<number> {
  const deleted = await db.delete(session).where(eq(session.userId, userId)).returning({
    id: session.id,
  })
  return deleted.length
}

export async function listMcpTokenAuditEvents(tokenId: string) {
  return db
    .select()
    .from(mcpTokenAuditEvents)
    .where(eq(mcpTokenAuditEvents.tokenId, tokenId))
    .orderBy(desc(mcpTokenAuditEvents.createdAt))
    .limit(50)
}

export async function listOpenMcpTokenAlerts(tokenId: string) {
  return db
    .select()
    .from(mcpTokenAlerts)
    .where(and(eq(mcpTokenAlerts.tokenId, tokenId), eq(mcpTokenAlerts.status, 'open')))
    .orderBy(desc(mcpTokenAlerts.lastSeenAt))
}
