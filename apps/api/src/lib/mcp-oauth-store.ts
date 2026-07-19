import { db, mcpOauthAuthorizationCode, mcpOauthToken, oauthApplication } from '@convergekit/db'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type { Executor } from './db-executor.js'
import { emitMcpOAuthEvent } from './mcp-oauth-events.js'
import type { McpScope } from './mcp-token-policy.js'
import {
  classifyRefresh,
  computeAbsoluteExpiry,
  computeAccessTokenExpiry,
  computeAuthCodeExpiry,
  evaluateAccessToken,
  generateOpaqueToken,
  hashOAuthToken,
  newTokenFamilyId,
  pkceVerify,
} from './mcp-oauth-policy.js'

export type OAuthClient = {
  clientId: string
  clientName: string | null
  redirectUris: string[]
  disabled: boolean
}

export async function findOAuthClient(clientId: string): Promise<OAuthClient | null> {
  const [row] = await db
    .select()
    .from(oauthApplication)
    .where(eq(oauthApplication.clientId, clientId))
    .limit(1)
  if (!row) return null
  return {
    clientId: row.clientId,
    clientName: row.name ?? null,
    redirectUris: (row.redirectUrls ?? '')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean),
    disabled: row.disabled ?? false,
  }
}

export async function createAuthorizationCode(input: {
  clientId: string
  userId: string
  redirectUri: string
  scopes: McpScope[]
  codeChallenge: string
  codeChallengeMethod: string
}): Promise<string> {
  const rawCode = generateOpaqueToken()
  await db.insert(mcpOauthAuthorizationCode).values({
    codeHash: hashOAuthToken(rawCode),
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    scopes: input.scopes,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod,
    expiresAt: computeAuthCodeExpiry(),
  })
  return rawCode
}

export type ConsumeCodeResult =
  | { ok: true; userId: string; clientId: string; scopes: McpScope[] }
  | { ok: false; error: 'invalid_grant' | 'invalid_client' }

export async function consumeAuthorizationCode(
  rawCode: string,
  ctx: { codeVerifier: string; clientId: string; redirectUri: string },
): Promise<ConsumeCodeResult> {
  const codeHash = hashOAuthToken(rawCode)
  // Single-use: only match an unconsumed row, and stamp consumedAt atomically.
  const [row] = await db
    .update(mcpOauthAuthorizationCode)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(mcpOauthAuthorizationCode.codeHash, codeHash),
        isNull(mcpOauthAuthorizationCode.consumedAt),
      ),
    )
    .returning()
  if (!row) return { ok: false, error: 'invalid_grant' }
  if (row.expiresAt <= new Date()) return { ok: false, error: 'invalid_grant' }
  if (row.clientId !== ctx.clientId || row.redirectUri !== ctx.redirectUri) {
    return { ok: false, error: 'invalid_client' }
  }
  // S256-only: plain is rejected (the method was already constrained at authorize).
  if (
    row.codeChallengeMethod.toLowerCase() !== 's256' ||
    !pkceVerify(ctx.codeVerifier, row.codeChallenge, 'S256')
  ) {
    return { ok: false, error: 'invalid_grant' }
  }
  return { ok: true, userId: row.userId, clientId: row.clientId, scopes: row.scopes as McpScope[] }
}

export type IssuedTokens = {
  accessToken: string
  refreshToken: string
  expiresInSeconds: number
  scope: string
}

async function issueIntoFamily(input: {
  familyId: string
  userId: string
  clientId: string
  scopes: string[]
  absoluteExpiresAt: Date
  rotatedFromId: string | null
  // 'token_issued' for a brand-new grant, 'token_refreshed' for a rotation.
  event: 'token_issued' | 'token_refreshed'
}): Promise<IssuedTokens> {
  const accessToken = generateOpaqueToken()
  const refreshToken = generateOpaqueToken()
  const accessTokenExpiresAt = computeAccessTokenExpiry()
  await db.insert(mcpOauthToken).values({
    familyId: input.familyId,
    userId: input.userId,
    clientId: input.clientId,
    accessTokenHash: hashOAuthToken(accessToken),
    refreshTokenHash: hashOAuthToken(refreshToken),
    scopes: input.scopes,
    accessTokenExpiresAt,
    // The per-token refresh expiry equals the family absolute cap: rotation never
    // extends the 60-day ceiling set at family creation.
    refreshTokenExpiresAt: input.absoluteExpiresAt,
    absoluteExpiresAt: input.absoluteExpiresAt,
    rotatedFromId: input.rotatedFromId,
  })
  emitMcpOAuthEvent(input.event, {
    userId: input.userId,
    clientId: input.clientId,
    familyId: input.familyId,
  })
  return {
    accessToken,
    refreshToken,
    expiresInSeconds: Math.floor((accessTokenExpiresAt.getTime() - Date.now()) / 1000),
    scope: input.scopes.join(' '),
  }
}

export async function issueGrant(input: {
  userId: string
  clientId: string
  scopes: string[]
}): Promise<IssuedTokens> {
  return issueIntoFamily({
    familyId: newTokenFamilyId(),
    userId: input.userId,
    clientId: input.clientId,
    scopes: input.scopes,
    absoluteExpiresAt: computeAbsoluteExpiry(),
    rotatedFromId: null,
    event: 'token_issued',
  })
}

export type AccessPrincipal = {
  oauthTokenId: string
  userId: string
  clientId: string
  scopes: McpScope[]
}

export async function validateAccessToken(rawAccess: string): Promise<AccessPrincipal | null> {
  const [row] = await db
    .select()
    .from(mcpOauthToken)
    .where(eq(mcpOauthToken.accessTokenHash, hashOAuthToken(rawAccess)))
    .limit(1)
  if (!row) return null
  if (evaluateAccessToken(row, new Date()) !== 'valid') return null
  return {
    oauthTokenId: row.id,
    userId: row.userId,
    clientId: row.clientId,
    scopes: row.scopes as McpScope[],
  }
}

export async function touchOAuthGrantUsage(
  oauthTokenId: string,
  input: {
    ip: string
    userAgent: string | null
    clientName: string | null
    toolName: string | null
  },
) {
  await db
    .update(mcpOauthToken)
    .set({
      lastUsedAt: new Date(),
      lastUsedIp: input.ip,
      lastUsedUserAgent: input.userAgent,
      // Preserve the last known client/tool name when this call carries neither
      // (e.g. a tools/list request) — mirrors the static touchMcpTokenUsage fallback.
      ...(input.clientName !== null ? { lastUsedClientName: input.clientName } : {}),
      ...(input.toolName !== null ? { lastUsedToolName: input.toolName } : {}),
    })
    .where(eq(mcpOauthToken.id, oauthTokenId))
    .catch(() => undefined)
}

export async function revokeFamily(familyId: string, reason: string): Promise<void> {
  await db
    .update(mcpOauthToken)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(mcpOauthToken.familyId, familyId), isNull(mcpOauthToken.revokedAt)))
}

export type RotateResult =
  | { ok: true; tokens: IssuedTokens }
  | { ok: false; error: 'invalid_grant' }

export async function rotateRefreshToken(
  rawRefresh: string,
  ctx: { clientId: string },
): Promise<RotateResult> {
  const [row] = await db
    .select()
    .from(mcpOauthToken)
    .where(eq(mcpOauthToken.refreshTokenHash, hashOAuthToken(rawRefresh)))
    .limit(1)
  if (!row || row.clientId !== ctx.clientId) return { ok: false, error: 'invalid_grant' }

  const decision = classifyRefresh(row, new Date())
  switch (decision) {
    case 'reuse_detected':
      // Replay of an already-rotated token -> nuke the whole family.
      await revokeFamily(row.familyId, 'refresh_reuse_detected')
      emitMcpOAuthEvent('token_revoked', {
        familyId: row.familyId,
        initiator: 'reuse_detection',
      })
      return { ok: false, error: 'invalid_grant' }
    case 'absolute_expired':
    case 'expired':
      return { ok: false, error: 'invalid_grant' }
    case 'rotate': {
      // Atomic compare-and-swap: only claim the row if it is still un-revoked, so two
      // concurrent refreshes of the same token cannot both issue (double-issue race).
      // We KEEP its refresh_token_hash so a future replay still matches this row and
      // trips reuse_detected above.
      const claimed = await db
        .update(mcpOauthToken)
        .set({ revokedAt: new Date(), revokedReason: 'rotated' })
        .where(and(eq(mcpOauthToken.id, row.id), isNull(mcpOauthToken.revokedAt)))
        .returning({ id: mcpOauthToken.id })
      if (claimed.length === 0) return { ok: false, error: 'invalid_grant' }
      const tokens = await issueIntoFamily({
        familyId: row.familyId,
        userId: row.userId,
        clientId: row.clientId,
        scopes: row.scopes,
        absoluteExpiresAt: row.absoluteExpiresAt,
        rotatedFromId: row.id,
        event: 'token_refreshed',
      })
      return { ok: true, tokens }
    }
  }
}

export async function revokeGrantsForUser(
  userId: string,
  reason: string,
  executor: Executor = db,
): Promise<number> {
  const rows = await executor
    .update(mcpOauthToken)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(mcpOauthToken.userId, userId), isNull(mcpOauthToken.revokedAt)))
    .returning({ id: mcpOauthToken.id })
  return rows.length
}

export async function revokeGrantsForUserClient(
  userId: string,
  clientId: string,
  reason: string,
): Promise<number> {
  const rows = await db
    .update(mcpOauthToken)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(
      and(
        eq(mcpOauthToken.userId, userId),
        eq(mcpOauthToken.clientId, clientId),
        isNull(mcpOauthToken.revokedAt),
      ),
    )
    .returning({ id: mcpOauthToken.id })
  return rows.length
}

export type ConnectedAgent = {
  clientId: string
  createdAt: Date
  lastUsedAt: Date | null
}

export async function listConnectedAgents(userId: string): Promise<ConnectedAgent[]> {
  const rows = await db
    .select()
    .from(mcpOauthToken)
    .where(and(eq(mcpOauthToken.userId, userId), isNull(mcpOauthToken.revokedAt)))
    .orderBy(desc(mcpOauthToken.createdAt))
  const byClient = new Map<string, ConnectedAgent>()
  for (const row of rows) {
    const existing = byClient.get(row.clientId)
    if (!existing) {
      byClient.set(row.clientId, {
        clientId: row.clientId,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
      })
    }
  }
  return [...byClient.values()]
}
