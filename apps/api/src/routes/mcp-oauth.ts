import { auth } from '@convergekit/auth'
import { resolveMcpOAuthConfig } from '@convergekit/config/mcp-oauth'
import { Hono } from 'hono'
import { scopedRepositoryIds } from '../lib/scoping.js'
import { signConsentRequest, verifyConsentRequest } from '../lib/mcp-oauth-consent.js'
import { emitMcpOAuthEvent } from '../lib/mcp-oauth-events.js'
import { filterMcpScopes } from '../lib/mcp-oauth-policy.js'
import {
  consumeAuthorizationCode,
  createAuthorizationCode,
  findOAuthClient,
  issueGrant,
  rotateRefreshToken,
} from '../lib/mcp-oauth-store.js'

const config = resolveMcpOAuthConfig(process.env)
const secret = process.env.BETTER_AUTH_SECRET ?? ''

// Consent request tokens are HMAC-signed with this secret; an empty secret would make
// them forgeable. @convergekit/auth already requires BETTER_AUTH_SECRET at startup, but assert
// it explicitly so the AS endpoints can never sign/verify with an empty key when enabled.
if (config.enabled && secret.length === 0) {
  throw new Error('BETTER_AUTH_SECRET must be set when MCP OAuth is enabled (consent token signing).')
}

export const mcpOAuthRoutes = new Hono()

function redirectError(redirectUri: string, error: string, state: string | null): string {
  const url = new URL(redirectUri)
  url.searchParams.set('error', error)
  if (state) url.searchParams.set('state', state)
  return url.toString()
}

// ─── GET /api/mcp-oauth/authorize ─────────────────────────────────────────────
mcpOAuthRoutes.get('/authorize', async (c) => {
  if (!config.enabled || !config.loginUrl || !config.consentUrl) {
    return c.json({ error: 'Not found' }, 404)
  }
  const q = c.req.query()
  const clientId = q.client_id
  const redirectUri = q.redirect_uri
  const state = q.state ?? null

  if (!clientId || !redirectUri) return c.json({ error: 'invalid_request' }, 400)

  const client = await findOAuthClient(clientId)
  if (!client || client.disabled) return c.json({ error: 'invalid_client' }, 400)
  if (!client.redirectUris.includes(redirectUri)) {
    // Never redirect to an unregistered URI.
    return c.json({ error: 'invalid_request', error_description: 'redirect_uri mismatch' }, 400)
  }
  if (q.response_type !== 'code') {
    return c.redirect(redirectError(redirectUri, 'unsupported_response_type', state))
  }

  // S256-only.
  if (!q.code_challenge || (q.code_challenge_method ?? '').toLowerCase() !== 's256') {
    return c.redirect(redirectError(redirectUri, 'invalid_request', state))
  }

  const scopes = filterMcpScopes((q.scope ?? '').split(' ').filter(Boolean))
  if (scopes.length === 0) return c.redirect(redirectError(redirectUri, 'invalid_scope', state))

  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user?.id) {
    // Our own login bounce: send the browser to the web sign-in page with the full
    // authorize URL as redirectTo. NOT the plugin's oidc_login_prompt cookie.
    const back = new URL(`${config.issuerUrl}/api/mcp-oauth/authorize`)
    back.search = new URLSearchParams(q).toString()
    const login = new URL(config.loginUrl)
    login.searchParams.set('redirectTo', back.toString())
    return c.redirect(login.toString())
  }

  // Logged in -> ALWAYS render consent (the case the plugin would skip).
  const request = signConsentRequest(
    {
      clientId,
      redirectUri,
      scopes,
      codeChallenge: q.code_challenge,
      codeChallengeMethod: 'S256',
      state,
      userId: session.user.id,
      exp: Date.now() + 600_000,
    },
    secret,
  )
  const consent = new URL(config.consentUrl)
  consent.searchParams.set('request', request)
  return c.redirect(consent.toString())
})

// ─── GET /api/mcp-oauth/consent — display data for the consent page ────────────
mcpOAuthRoutes.get('/consent', async (c) => {
  if (!config.enabled) return c.json({ error: 'Not found' }, 404)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user?.id) return c.json({ error: 'unauthenticated' }, 401)

  const request = verifyConsentRequest(c.req.query('request') ?? '', secret)
  if (!request || request.userId !== session.user.id) {
    return c.json({ error: 'invalid_request' }, 400)
  }

  const client = await findOAuthClient(request.clientId)
  const repoCount = (await scopedRepositoryIds(session.user.id)).size
  return c.json({
    clientName: client?.clientName ?? request.clientId,
    scopes: request.scopes,
    repositoryCount: repoCount,
    user: { name: session.user.name, email: session.user.email },
  })
})

// ─── POST /api/mcp-oauth/consent — decision -> mint code ──────────────────────
mcpOAuthRoutes.post('/consent', async (c) => {
  if (!config.enabled) return c.json({ error: 'Not found' }, 404)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user?.id) return c.json({ error: 'unauthenticated' }, 401)

  const body = (await c.req.json().catch(() => ({}))) as { request?: string; decision?: string }
  const request = verifyConsentRequest(body.request ?? '', secret)
  if (!request || request.userId !== session.user.id) {
    return c.json({ error: 'invalid_request' }, 400)
  }

  if (body.decision !== 'approve') {
    emitMcpOAuthEvent('consent_denied', { userId: request.userId, clientId: request.clientId })
    return c.json({ redirectUri: redirectError(request.redirectUri, 'access_denied', request.state) })
  }

  const code = await createAuthorizationCode({
    clientId: request.clientId,
    userId: request.userId,
    redirectUri: request.redirectUri,
    scopes: request.scopes,
    codeChallenge: request.codeChallenge,
    codeChallengeMethod: request.codeChallengeMethod,
  })
  emitMcpOAuthEvent('consent_granted', { userId: request.userId, clientId: request.clientId })
  const url = new URL(request.redirectUri)
  url.searchParams.set('code', code)
  if (request.state) url.searchParams.set('state', request.state)
  return c.json({ redirectUri: url.toString() })
})

// ─── POST /api/mcp-oauth/token ────────────────────────────────────────────────
mcpOAuthRoutes.post('/token', async (c) => {
  if (!config.enabled) return c.json({ error: 'invalid_request' }, 400)

  const form = await c.req.parseBody().catch(() => ({}) as Record<string, string>)
  const field = (key: string): string => {
    const value = form[key]
    return typeof value === 'string' ? value : ''
  }
  const grantType = field('grant_type')
  const clientId = field('client_id')

  // Re-check the client at token time: a client disabled (or deleted) after a grant
  // was issued must not be able to redeem an auth code or refresh a token.
  const client = await findOAuthClient(clientId)
  if (!client || client.disabled) return c.json({ error: 'invalid_client' }, 401)

  if (grantType === 'authorization_code') {
    const result = await consumeAuthorizationCode(field('code'), {
      codeVerifier: field('code_verifier'),
      clientId,
      redirectUri: field('redirect_uri'),
    })
    if (!result.ok) return c.json({ error: result.error }, 400)
    const tokens = await issueGrant({
      userId: result.userId,
      clientId: result.clientId,
      scopes: result.scopes,
    })
    return c.json(tokenResponse(tokens))
  }

  if (grantType === 'refresh_token') {
    const result = await rotateRefreshToken(field('refresh_token'), { clientId })
    if (!result.ok) return c.json({ error: result.error }, 400)
    return c.json(tokenResponse(result.tokens))
  }

  return c.json({ error: 'unsupported_grant_type' }, 400)
})

function tokenResponse(tokens: {
  accessToken: string
  refreshToken: string
  expiresInSeconds: number
  scope: string
}) {
  return {
    access_token: tokens.accessToken,
    token_type: 'bearer',
    expires_in: tokens.expiresInSeconds,
    refresh_token: tokens.refreshToken,
    scope: tokens.scope,
  }
}
