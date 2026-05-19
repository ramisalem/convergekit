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
 * All three methods are protected by `requireMcpToken`, which scopes the
 * caller to a single repository (`mcpRepositoryId`). Sessions are bound to
 * that repository at creation so a token issued for repo A cannot reuse a
 * session id created under repo B.
 *
 * Uses the Web-Standard transport variant (Request/Response), which fits
 * Hono's `c.req.raw` / returned-Response model cleanly and avoids the raw
 * Node socket manipulation that the legacy SSE transport required.
 */

import { getAiSettingsForRepo } from '@convergekit/db'
import { createMcpServer } from '@convergekit/mcp'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import {
  getEmbeddingOptionsForProfile,
  getRepositoryEmbeddingState,
} from '../lib/embedding-compatibility.js'
import { mcpToolsForScopes } from '../lib/mcp-token-policy.js'
import {
  clientIp,
  normalizeContextScopes,
  raiseSuspiciousUseAlerts,
  recordMcpAuditEvent,
  touchMcpTokenUsage,
} from '../lib/mcp-token-security.js'

export const mcpRoutes = new Hono()

type Session = {
  transport: WebStandardStreamableHTTPServerTransport
  repositoryId: string
}

const sessions = new Map<string, Session>()

type JsonRpcLike = {
  method?: unknown
  params?: {
    name?: unknown
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
  return { method, toolName, clientName }
}

async function handleAuditedRequest(
  c: Context,
  transport: WebStandardStreamableHTTPServerTransport,
  body?: unknown,
): Promise<Response> {
  const startedAt = Date.now()
  const token = c.get('mcpToken')
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
    await recordMcpAuditEvent({
      token,
      clientLabel: token.label,
      clientName: metadata.clientName,
      ipAddress,
      userAgent,
      method: metadata.method,
      toolName: metadata.toolName,
      latencyMs: Date.now() - startedAt,
      status,
      statusCode: response.status,
      errorCode: status === 'failure' ? String(response.status) : null,
    })

    if (status === 'success') {
      await raiseSuspiciousUseAlerts({ token, ipAddress, userAgent })
      await touchMcpTokenUsage({
        token,
        ipAddress,
        userAgent,
        clientName: metadata.clientName,
        toolName: metadata.toolName,
      })
    }

    return response
  } catch (err) {
    await recordMcpAuditEvent({
      token,
      clientLabel: token.label,
      clientName: metadata.clientName,
      ipAddress,
      userAgent,
      method: metadata.method,
      toolName: metadata.toolName,
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
  const token = c.get('mcpToken')
  const metadata = mcpRequestMetadata(body, c.req.method)
  await recordMcpAuditEvent({
    token,
    clientLabel: token.label,
    clientName: metadata.clientName,
    ipAddress: clientIp(c),
    userAgent: c.req.header('user-agent') ?? null,
    method: metadata.method,
    toolName: metadata.toolName,
    latencyMs: 0,
    status: 'failure',
    statusCode: response.status,
    errorCode: String(response.status),
  })
  return response
}

// ─── POST /api/mcp — initialize or relay a client request ─────────────────────

mcpRoutes.post('/', async (c) => {
  const repositoryId = c.get('mcpRepositoryId')
  const token = c.get('mcpToken')
  const sessionId = c.req.header('mcp-session-id')
  const body = (await c.req.json().catch(() => undefined)) as unknown

  let transport: WebStandardStreamableHTTPServerTransport

  if (sessionId) {
    const existing = sessions.get(sessionId)
    if (!existing || existing.repositoryId !== repositoryId) {
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
    const aiSettings = await getAiSettingsForRepo(repositoryId)
    const embeddingState = await getRepositoryEmbeddingState(repositoryId, aiSettings)
    const embeddingOptions = getEmbeddingOptionsForProfile(aiSettings, embeddingState.storedProfile)
    const enabledTools = mcpToolsForScopes(normalizeContextScopes(token.scopes))

    transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        sessions.set(sid, { transport, repositoryId })
      },
      onsessionclosed: (sid) => {
        sessions.delete(sid)
      },
    })
    transport.onclose = () => {
      const sid = transport.sessionId
      if (sid) sessions.delete(sid)
    }

    const server = createMcpServer(repositoryId, { embeddingOptions, enabledTools })
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
  const repositoryId = c.get('mcpRepositoryId')
  const sessionId = c.req.header('mcp-session-id')
  const existing = sessionId ? sessions.get(sessionId) : undefined
  if (!existing || existing.repositoryId !== repositoryId) {
    return auditFailureResponse(c, undefined, c.text('Invalid or missing session ID', 400))
  }
  return handleAuditedRequest(c, existing.transport)
}

mcpRoutes.get('/', handleSessionRequest)
mcpRoutes.delete('/', handleSessionRequest)
