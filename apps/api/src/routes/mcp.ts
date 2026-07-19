/**
 * MCP routes — JDW-50
 *
 * Implements the MCP **Streamable HTTP** transport on a single endpoint:
 *
 *   POST   /api/mcp  — JSON-RPC requests from the client. The first POST with
 *                      no `mcp-session-id` header must be an `initialize`; the
 *                      server generates a session id and returns it in the
 *                      `Mcp-Session-Id` response header. Subsequent POSTs must
 *                      include that header.
 *   GET    /api/mcp  — opens the optional SSE stream for server-initiated
 *                      notifications on an existing session.
 *   DELETE /api/mcp  — closes an existing session.
 *
 * All three methods are protected by `requireMcpCredential`, which resolves a
 * normalized `mcpPrincipal` — either a `static` CI token (user-level, or a
 * grandfathered per-repo token served repo-implied) or an `oauth` user-scoped
 * grant. Sessions are keyed by a derived `principalKey`
 * (`static:<tokenId>` or `oauth:<userId>`) so a credential for one principal
 * cannot reuse a session id created under another.
 *
 * Uses the Web-Standard transport variant (Request/Response), which fits
 * Hono's `c.req.raw` / returned-Response model cleanly and avoids the raw
 * Node socket manipulation that the legacy SSE transport required.
 */

import { getAiSettingsForRepo } from '@convergekit/db'
import { createMcpServer, createUserScopedMcpServer } from '@convergekit/mcp'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { logger } from '../logger.js'
import {
  getEmbeddingOptionsForProfile,
  getRepositoryEmbeddingState,
} from '../lib/embedding-compatibility.js'
import { buildUserServerDeps } from '../lib/mcp-oauth-tools.js'
import { touchOAuthGrantUsage } from '../lib/mcp-oauth-store.js'
import {
  createMcpSessionLifecycleHandlers,
  McpSessionStore,
  parseMcpSessionStoreConfig,
  type McpSessionRecord,
} from '../lib/mcp-session-store.js'
import { mcpToolsForScopes } from '../lib/mcp-token-policy.js'
import {
  clientIp,
  normalizeContextScopes,
  raiseSuspiciousUseAlerts,
  recordMcpAuditEvent,
  recordOAuthMcpAuditEvent,
  touchMcpTokenUsage,
  type McpAuditStatus,
} from '../lib/mcp-token-security.js'
import type { McpPrincipal } from '../middleware/require-mcp-credential.js'

export const mcpRoutes = new Hono()

const sessionConfig = parseMcpSessionStoreConfig(process.env)
const sessions = new McpSessionStore<WebStandardStreamableHTTPServerTransport>(sessionConfig)

async function closeMcpSessions(records: McpSessionRecord<WebStandardStreamableHTTPServerTransport>[], reason: string) {
  if (records.length === 0) return
  const log = reason === 'expired' ? logger.info.bind(logger) : logger.warn.bind(logger)
  log({ count: records.length, reason }, 'Closing MCP sessions')
  await Promise.allSettled(records.map((record) => record.transport.close()))
}

const sessionSweepTimer = setInterval(() => {
  const expired = sessions.sweepExpired()
  void closeMcpSessions(expired, 'expired')
}, sessionConfig.sweepIntervalMs)
sessionSweepTimer.unref?.()

type JsonRpcLike = {
  method?: unknown
  params?: {
    name?: unknown
    arguments?: {
      repository?: unknown
    }
    clientInfo?: {
      name?: unknown
    }
  }
}

function mcpRequestMetadata(body: unknown, fallbackMethod: string) {
  const rpc = body && typeof body === 'object' ? (body as JsonRpcLike) : null
  const method = typeof rpc?.method === 'string' ? rpc.method : fallbackMethod
  const toolName =
    method === 'tools/call' && typeof rpc?.params?.name === 'string' ? rpc.params.name : null
  const clientName =
    method === 'initialize' && typeof rpc?.params?.clientInfo?.name === 'string'
      ? rpc.params.clientInfo.name
      : null
  // Best-effort: the tool call's `repository` argument is a ref (id OR name).
  const repositoryArg =
    typeof rpc?.params?.arguments?.repository === 'string' ? rpc.params.arguments.repository : null
  return { method, toolName, clientName, repositoryArg }
}

type AuditFields = {
  latencyMs: number
  status: McpAuditStatus
  statusCode: number | null
  errorCode: string | null
}

async function recordPrincipalAudit(
  c: Context,
  principal: McpPrincipal,
  metadata: ReturnType<typeof mcpRequestMetadata>,
  ipAddress: string,
  userAgent: string | null,
  fields: AuditFields,
): Promise<void> {
  if (principal.kind === 'oauth') {
    await recordOAuthMcpAuditEvent({
      oauthTokenId: principal.oauthTokenId,
      userId: principal.userId,
      clientId: principal.clientId,
      clientName: metadata.clientName,
      // The per-call `repository` argument (metadata.repositoryArg) is a ref — an id
      // OR a name — and is not guaranteed to be a valid `repositories.id`. The audit
      // column `repository_id` is a uuid FK, so inserting a raw ref would risk an FK
      // violation. The clientId + oauthTokenId + toolName already identify the call,
      // so we deliberately record `null` here.
      repositoryId: null,
      ipAddress,
      userAgent,
      method: metadata.method,
      toolName: metadata.toolName,
      latencyMs: fields.latencyMs,
      status: fields.status,
      statusCode: fields.statusCode,
      errorCode: fields.errorCode,
    })
    return
  }

  const token = c.get('mcpToken')
  await recordMcpAuditEvent({
    token,
    clientLabel: token.label,
    clientName: metadata.clientName,
    ipAddress,
    userAgent,
    method: metadata.method,
    toolName: metadata.toolName,
    latencyMs: fields.latencyMs,
    status: fields.status,
    statusCode: fields.statusCode,
    errorCode: fields.errorCode,
  })
}

async function handleAuditedRequest(
  c: Context,
  transport: WebStandardStreamableHTTPServerTransport,
  body?: unknown,
): Promise<Response> {
  const startedAt = Date.now()
  const principal = c.get('mcpPrincipal')
  const ipAddress = clientIp(c)
  const userAgent = c.req.header('user-agent') ?? null
  const metadata = mcpRequestMetadata(body, c.req.method)
  let response: Response | null = null

  try {
    response =
      body === undefined
        ? await transport.handleRequest(c.req.raw)
        : await transport.handleRequest(c.req.raw, { parsedBody: body })

    const status = response.status >= 400 ? 'failure' : 'success'
    await recordPrincipalAudit(c, principal, metadata, ipAddress, userAgent, {
      latencyMs: Date.now() - startedAt,
      status,
      statusCode: response.status,
      errorCode: status === 'failure' ? String(response.status) : null,
    })

    if (status === 'success') {
      if (principal.kind === 'oauth') {
        await touchOAuthGrantUsage(principal.oauthTokenId, {
          ip: ipAddress,
          userAgent,
          clientName: metadata.clientName,
          toolName: metadata.toolName,
        })
      } else {
        const token = c.get('mcpToken')
        await raiseSuspiciousUseAlerts({ token, ipAddress, userAgent })
        await touchMcpTokenUsage({
          token,
          ipAddress,
          userAgent,
          clientName: metadata.clientName,
          toolName: metadata.toolName,
        })
      }
    }

    return response
  } catch (err) {
    await recordPrincipalAudit(c, principal, metadata, ipAddress, userAgent, {
      latencyMs: Date.now() - startedAt,
      status: 'failure',
      statusCode: response?.status ?? 500,
      errorCode: err instanceof Error ? err.name : 'UNKNOWN',
    })
    throw err
  }
}

async function auditFailureResponse(
  c: Context,
  body: unknown,
  response: Response,
): Promise<Response> {
  const principal = c.get('mcpPrincipal')
  const metadata = mcpRequestMetadata(body, c.req.method)
  await recordPrincipalAudit(
    c,
    principal,
    metadata,
    clientIp(c),
    c.req.header('user-agent') ?? null,
    {
      latencyMs: 0,
      status: 'failure',
      statusCode: response.status,
      errorCode: String(response.status),
    },
  )
  return response
}

// ─── POST /api/mcp — initialize or relay a client request ─────────────────────

mcpRoutes.post('/', async (c) => {
  const principal = c.get('mcpPrincipal')
  const principalKey =
    principal.kind === 'oauth' ? `oauth:${principal.userId}` : `static:${principal.mcpTokenId}`
  const sessionId = c.req.header('mcp-session-id')
  const body = (await c.req.json().catch(() => undefined)) as unknown

  let transport: WebStandardStreamableHTTPServerTransport

  if (sessionId) {
    const existing = sessions.get(sessionId, principalKey)
    if (!existing) {
      return auditFailureResponse(
        c,
        body,
        c.json(
          {
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Invalid or unknown session ID' },
            id: null,
          },
          404,
        ),
      )
    }
    transport = existing.transport
  } else if (isInitializeRequest(body)) {
    // The transport invokes these callbacks only after this constructor assigns the binding.
    const lifecycle = createMcpSessionLifecycleHandlers({
      sessions,
      principalKey,
      getTransport: () => transport,
      closeEvictedSessions: closeMcpSessions,
    })

    transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: lifecycle.onsessioninitialized,
      onsessionclosed: lifecycle.onsessionclosed,
    })
    transport.onclose = lifecycle.onclose

    let server: ReturnType<typeof createUserScopedMcpServer>
    if (principal.kind === 'oauth') {
      server = createUserScopedMcpServer(buildUserServerDeps(principal.userId))
    } else if (principal.repositoryId === null) {
      // user-level CI token: user-scoped server, scope-gated
      const enabledTools = mcpToolsForScopes(normalizeContextScopes(principal.scopes))
      server = createUserScopedMcpServer(buildUserServerDeps(principal.userId), { enabledTools })
    } else {
      // grandfathered per-repo token: repo-implied server (unchanged old behavior)
      const aiSettings = await getAiSettingsForRepo(principal.repositoryId)
      const embeddingState = await getRepositoryEmbeddingState(principal.repositoryId, aiSettings)
      const embeddingOptions = getEmbeddingOptionsForProfile(
        aiSettings,
        embeddingState.storedProfile,
      )
      const enabledTools = mcpToolsForScopes(normalizeContextScopes(principal.scopes))
      server = createMcpServer(principal.repositoryId, { embeddingOptions, enabledTools })
    }
    await server.connect(transport)
  } else {
    return auditFailureResponse(
      c,
      body,
      c.json(
        {
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
          id: null,
        },
        400,
      ),
    )
  }

  return handleAuditedRequest(c, transport, body)
})

// ─── GET & DELETE /api/mcp — operate on an existing session ───────────────────

async function handleSessionRequest(c: Context): Promise<Response> {
  const principal = c.get('mcpPrincipal')
  const principalKey =
    principal.kind === 'oauth' ? `oauth:${principal.userId}` : `static:${principal.mcpTokenId}`
  const sessionId = c.req.header('mcp-session-id')
  const existing = sessionId ? sessions.get(sessionId, principalKey) : undefined
  if (!existing) {
    return auditFailureResponse(c, undefined, c.text('Invalid or missing session ID', 400))
  }
  return handleAuditedRequest(c, existing.transport)
}

mcpRoutes.get('/', handleSessionRequest)
mcpRoutes.delete('/', handleSessionRequest)
