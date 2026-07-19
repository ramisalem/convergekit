import { db, mcpTokenAlerts, mcpTokens, user } from '@convergekit/db'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { NotFoundError } from '../errors.js'
import type { Executor, TxHooks } from './db-executor.js'
import { buildMcpTokenConfig } from './mcp-config.js'
import {
  ALL_MCP_SCOPES,
  createMcpTokenSecret,
  getMcpTokenStatus,
  normalizeMcpScopes,
  resolveMcpTokenExpiry,
  type McpScope,
} from './mcp-token-policy.js'

// Shared by both the admin oversight router (ci-tokens.ts) and the self-service
// router (me-ci-tokens.ts): schemas, serialization, lookups, and the row-locked
// create/renew seam that the integration suite hooks into directly.

export const createCiTokenSchema = z.object({
  label: z.string().min(1).max(100),
  expiresInDays: z.union([z.literal(7), z.literal(30), z.literal(90)]).optional(),
  scopes: z.array(z.enum(ALL_MCP_SCOPES)).optional(),
})

export const testCiConnectionSchema = z.object({
  token: z.string().optional(),
})

// The shared mcp_tokens select map for CI-token listings — spread into each
// router's .select() (optionally alongside join columns).
export const ciTokenColumns = {
  id: mcpTokens.id,
  label: mcpTokens.label,
  fingerprint: mcpTokens.fingerprint,
  scopes: mcpTokens.scopes,
  expiresAt: mcpTokens.expiresAt,
  revokedAt: mcpTokens.revokedAt,
  revokedReason: mcpTokens.revokedReason,
  lastUsedAt: mcpTokens.lastUsedAt,
  lastUsedIp: mcpTokens.lastUsedIp,
  lastUsedUserAgent: mcpTokens.lastUsedUserAgent,
  lastUsedClientName: mcpTokens.lastUsedClientName,
  lastUsedToolName: mcpTokens.lastUsedToolName,
  createdAt: mcpTokens.createdAt,
}

type CiTokenRow = {
  id: string
  label: string
  fingerprint: string
  scopes: string[]
  expiresAt: Date
  revokedAt: Date | null
  revokedReason: string | null
  lastUsedAt: Date | null
  lastUsedIp: string | null
  lastUsedUserAgent: string | null
  lastUsedClientName: string | null
  lastUsedToolName: string | null
  createdAt: Date
  alertCount?: number
}

function baseSerializeCiToken(token: CiTokenRow) {
  return {
    id: token.id,
    label: token.label,
    fingerprint: token.fingerprint,
    scopes: token.scopes as McpScope[],
    status: getMcpTokenStatus(token),
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    revokedReason: token.revokedReason,
    lastUsedAt: token.lastUsedAt,
    lastUsedFrom: {
      ip: token.lastUsedIp,
      userAgent: token.lastUsedUserAgent,
      clientName: token.lastUsedClientName,
      toolName: token.lastUsedToolName,
    },
    createdAt: token.createdAt,
    alertCount: token.alertCount ?? 0,
  }
}

export function serializeCiToken(
  token: CiTokenRow & {
    // Required: the web client types owner as non-null (McpTokenListItem.owner) —
    // every caller resolves it (list join / getCiTokenOwner fallback).
    owner: { id: string; name: string; email: string }
  },
) {
  return { ...baseSerializeCiToken(token), owner: token.owner }
}

export function serializeLegacyCiToken(
  token: CiTokenRow & {
    // deletedAt: only the admin oversight list selects it (an active token on a
    // soft-deleted repo is exactly the anomaly oversight exists to catch); the
    // self-service list omits the key entirely and its output shape is unchanged.
    repository: { id: string; name: string; deletedAt?: Date | null }
    // Optional: only the admin oversight list (ci-tokens.ts) joins and passes an
    // owner. The self-service legacy list (me-ci-tokens.ts) never passes one, so
    // its output is unchanged — no `owner` key is emitted when it's absent.
    owner?: { id: string; name: string; email: string }
  },
) {
  return {
    ...baseSerializeCiToken(token),
    repository: {
      id: token.repository.id,
      name: token.repository.name,
      ...(token.repository.deletedAt !== undefined
        ? { deletedAt: token.repository.deletedAt }
        : {}),
    },
    ...(token.owner ? { owner: token.owner } : {}),
  }
}

export async function getCiTokenOwner(userId: string, executor: Executor = db) {
  const [owner] = await executor
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  // mcp_tokens.user_id is ON DELETE CASCADE, so a live token always has its owner
  // row — this fallback is unreachable in practice and exists only to satisfy
  // serializeCiToken's non-null `owner` contract.
  return owner ?? { id: userId, name: 'Unknown user', email: '' }
}

/** Batched open-alert counts for a token listing, keyed by token id. */
export async function getOpenAlertCountsByToken(
  tokenIds: string[],
  executor: Executor = db,
): Promise<Map<string, number>> {
  if (tokenIds.length === 0) return new Map()

  const rows = await executor
    .select({ tokenId: mcpTokenAlerts.tokenId, count: sql<number>`count(*)::int` })
    .from(mcpTokenAlerts)
    .where(and(inArray(mcpTokenAlerts.tokenId, tokenIds), eq(mcpTokenAlerts.status, 'open')))
    .groupBy(mcpTokenAlerts.tokenId)

  return new Map(rows.map((row) => [row.tokenId, row.count]))
}

// CI-token lookups always filter repository_id IS NULL: legacy repo-scoped ids
// are invisible to these endpoints and read as 404.
async function findCiToken(tokenId: string, executor: Executor = db) {
  return executor.query.mcpTokens.findFirst({
    where: and(eq(mcpTokens.id, tokenId), isNull(mcpTokens.repositoryId)),
  })
}

export async function assertCiToken(tokenId: string, executor: Executor = db) {
  const token = await findCiToken(tokenId, executor)
  if (!token) throw new NotFoundError('CI token')
  return token
}

export async function assertOwnedCiToken(userId: string, tokenId: string, executor: Executor = db) {
  const token = await assertCiToken(tokenId, executor)
  if (token.userId !== userId) throw new NotFoundError('CI token')
  return token
}

// Unlike findCiToken, this has no repository_id filter — it finds a token of
// EITHER shape (user-level or legacy repo-scoped). Reserved for admin oversight
// endpoints that span both: audit history, alerts, and acknowledgement.
async function findAnyCiToken(tokenId: string, executor: Executor = db) {
  return executor.query.mcpTokens.findFirst({
    where: eq(mcpTokens.id, tokenId),
  })
}

export async function assertAnyCiToken(tokenId: string, executor: Executor = db) {
  const token = await findAnyCiToken(tokenId, executor)
  if (!token) throw new NotFoundError('CI token')
  return token
}

/** Gate-free primitive — no capability check, no row lock; production creates go through createUserLevelToken. */
export async function issueCiToken(
  executor: Executor,
  {
    userId,
    label,
    expiresInDays,
    scopes,
    rotatedFromTokenId,
  }: {
    userId: string
    label: string
    expiresInDays?: 7 | 30 | 90
    scopes?: string[]
    rotatedFromTokenId?: string | null
  },
) {
  const { rawToken, tokenHash, fingerprint } = createMcpTokenSecret()
  const normalizedScopes = normalizeMcpScopes(scopes)
  const expiresAt = resolveMcpTokenExpiry(expiresInDays)

  const [created] = await executor
    .insert(mcpTokens)
    .values({
      repositoryId: null,
      userId,
      tokenHash,
      fingerprint,
      label,
      scopes: normalizedScopes,
      expiresAt,
      rotatedFromTokenId: rotatedFromTokenId ?? null,
    })
    .returning()

  const owner = await getCiTokenOwner(userId, executor)

  return {
    token: rawToken,
    tokenDetails: serializeCiToken({ ...created, owner }),
    ...buildMcpTokenConfig({ tokenId: created.id, label, rawToken }),
  }
}

/** Locks the caller's user row, re-checks capability + deactivation under the lock, issues a user-level token. */
export async function createUserLevelToken(
  executor: Executor,
  // expiresInDays matches issueCiToken's contract (7 | 30 | 90) so the pass-through compiles.
  input: { userId: string; label: string; expiresInDays?: 7 | 30 | 90; scopes?: string[] },
  hooks?: TxHooks,
) {
  const [u] = await executor
    .select({ ciTokensEnabled: user.ciTokensEnabled, deactivatedAt: user.deactivatedAt })
    .from(user)
    .where(eq(user.id, input.userId))
    .for('update') // SELECT … FOR UPDATE
    .limit(1)
  await hooks?.afterLock?.()
  if (!u || u.deactivatedAt || u.ciTokensEnabled !== true) return null
  const issued = await issueCiToken(executor, input) // sets repositoryId: null
  await hooks?.beforeCommit?.()
  return issued
}

/** Same lock + capability gate, then rotates a caller-owned token (issue-new + revoke-old, per the existing renew). */
export async function renewUserLevelToken(
  executor: Executor,
  input: { userId: string; tokenId: string },
  hooks?: TxHooks,
) {
  const [u] = await executor
    .select({ ciTokensEnabled: user.ciTokensEnabled, deactivatedAt: user.deactivatedAt })
    .from(user)
    .where(eq(user.id, input.userId))
    .for('update')
    .limit(1)
  await hooks?.afterLock?.()
  if (!u || u.deactivatedAt || u.ciTokensEnabled !== true) return null
  // assertOwnedCiToken throws NotFoundError (never returns null) on a missing or
  // foreign token, which propagates out of db.transaction as the 404 the routers need.
  const old = await assertOwnedCiToken(input.userId, input.tokenId, executor)
  // A revoked token is dead — renewing it would resurrect access, so it reads as
  // the same 404 as any other miss (no revoked-vs-missing oracle). Expired tokens
  // must still renew: that is renew's primary use case, so never filter expiresAt.
  if (old.revokedAt) throw new NotFoundError('CI token')

  // Renew preserves the existing scope set verbatim — including an empty array.
  const renewed = await issueCiToken(executor, {
    userId: input.userId,
    label: old.label,
    scopes: old.scopes,
    expiresInDays: 30,
    rotatedFromTokenId: old.id,
  })

  await executor
    .update(mcpTokens)
    .set({ revokedAt: new Date(), revokedReason: 'rotated' })
    .where(and(eq(mcpTokens.id, old.id), isNull(mcpTokens.revokedAt)))
  await hooks?.beforeCommit?.()
  return renewed
}
