import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createHash, randomBytes } from 'node:crypto'

// Talk to the api directly (over the container network), not the Caddy TLS endpoint.
export const BASE_URL = process.env.SMOKE_BASE_URL ?? `http://localhost:${process.env.PORT ?? '3001'}`

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

// Sessions are minted directly by seed.ts (mintSession); the suite never calls
// /sign-in/email, so it is SSO-agnostic and needs no Origin/CSRF handling here.

export async function dcr(redirectUris: string[]): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/mcp/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: redirectUris, client_name: 'mcp-oauth-e2e-smoke' }),
  })
  const body = (await res.json().catch(() => ({}))) as { clientId?: string; client_id?: string }
  const clientId = body.clientId ?? body.client_id
  if (!clientId) throw new Error(`DCR failed (${res.status}): ${JSON.stringify(body)}`)
  return clientId
}

export type AuthorizeParams = {
  cookie: string
  clientId: string
  redirectUri: string
  scope: string
  challenge: string
  state?: string
  challengeMethod?: string
}

// Returns the raw (manual-redirect) Response so callers assert status or Location.
export function authorize(p: AuthorizeParams): Promise<Response> {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: p.scope,
    code_challenge: p.challenge,
    code_challenge_method: p.challengeMethod ?? 'S256',
    state: p.state ?? 'smoke',
  })
  return fetch(`${BASE_URL}/api/mcp-oauth/authorize?${q}`, {
    headers: { cookie: p.cookie },
    redirect: 'manual',
  })
}

export function consentRequestFrom(res: Response): string {
  const loc = res.headers.get('location')
  if (!loc) throw new Error(`authorize did not redirect (status ${res.status})`)
  const request = new URL(loc, BASE_URL).searchParams.get('request')
  if (!request) throw new Error(`authorize Location has no request= token: ${loc}`)
  return request
}

export async function consent(
  cookie: string,
  request: string,
  decision: 'approve' | 'deny',
): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/mcp-oauth/consent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ request, decision }),
  })
  const body = (await res.json().catch(() => ({}))) as { redirectUri?: string }
  if (!body.redirectUri) {
    throw new Error(`consent returned no redirectUri (${res.status}): ${JSON.stringify(body)}`)
  }
  return body.redirectUri
}

export type TokenResult = {
  status: number
  body: {
    access_token?: string
    refresh_token?: string
    scope?: string
    error?: string
    [k: string]: unknown
  }
}

export async function token(form: Record<string, string>): Promise<TokenResult> {
  const res = await fetch(`${BASE_URL}/api/mcp-oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  })
  return { status: res.status, body: (await res.json().catch(() => ({}))) as TokenResult['body'] }
}

// Returns the HTTP status of GET /api/me/connected-agents for a session cookie.
// Used as a preflight to prove a minted session cookie is actually accepted by the
// running api before any cases run.
export async function connectedAgentsStatus(cookie: string): Promise<number> {
  const res = await fetch(`${BASE_URL}/api/me/connected-agents`, { headers: { cookie } })
  return res.status
}

export async function disconnectAgent(cookie: string, clientId: string): Promise<number> {
  const res = await fetch(`${BASE_URL}/api/me/connected-agents/${encodeURIComponent(clientId)}`, {
    method: 'DELETE',
    headers: { cookie },
  })
  return res.status
}

// Raw initialize POST — returns the HTTP status (200 valid, 401 revoked/invalid).
export async function mcpInitStatus(bearer: string): Promise<number> {
  const res = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'smoke', version: '1' },
      },
    }),
  })
  return res.status
}

// SDK client (handles session-id + SSE framing) for structured tool-result asserts.
export async function mcpClient(bearer: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE_URL}/api/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${bearer}` } },
  })
  const client = new Client({ name: 'mcp-oauth-e2e-smoke', version: '1' })
  await client.connect(transport)
  return client
}

export function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? []
  return content
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('')
}

// Full happy authorize → approve → token; returns the token response body.
export async function fullGrant(
  cookie: string,
  clientId: string,
  redirectUri: string,
  scope = 'repo:read docs:search files:read',
): Promise<{ access_token: string; refresh_token: string; scope: string }> {
  const { verifier, challenge } = pkcePair()
  const authzRes = await authorize({ cookie, clientId, redirectUri, scope, challenge })
  const request = consentRequestFrom(authzRes)
  const redirect = await consent(cookie, request, 'approve')
  const code = new URL(redirect).searchParams.get('code')
  if (!code) throw new Error(`approve produced no code: ${redirect}`)
  const { status, body } = await token({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  })
  if (status !== 200 || !body.access_token || !body.refresh_token) {
    throw new Error(`token exchange failed (${status}): ${JSON.stringify(body)}`)
  }
  return { access_token: body.access_token, refresh_token: body.refresh_token, scope: body.scope ?? '' }
}
