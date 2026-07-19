import * as oc from './oauth-client.js'
import type { SeedHandles } from './seed.js'

export const REDIRECT = 'http://localhost:9876/callback'

export type Ctx = {
  cookieA: string
  cookieB: string
  seed: SeedHandles
  newClient: () => Promise<string> // DCR + remember the client id for teardown
}

// Case 1 — happy path: full grant, then list tools over the MCP transport.
export async function case1(ctx: Ctx): Promise<void> {
  const clientId = await ctx.newClient()
  const tokens = await oc.fullGrant(ctx.cookieA, clientId, REDIRECT)
  const client = await oc.mcpClient(tokens.access_token)
  try {
    const { tools } = await client.listTools()
    if (!tools.some((t) => t.name === 'list_repositories')) {
      throw new Error(`list_repositories not advertised; got ${tools.map((t) => t.name).join(', ')}`)
    }
  } finally {
    await client.close()
  }
}

// Case 2 — an authorization code is single-use: the second exchange is rejected.
export async function case2(ctx: Ctx): Promise<void> {
  const clientId = await ctx.newClient()
  const { verifier, challenge } = oc.pkcePair()
  const authzRes = await oc.authorize({
    cookie: ctx.cookieA,
    clientId,
    redirectUri: REDIRECT,
    scope: 'repo:read',
    challenge,
  })
  const request = oc.consentRequestFrom(authzRes)
  const code = new URL(await oc.consent(ctx.cookieA, request, 'approve')).searchParams.get('code')
  if (!code) throw new Error('approve produced no code')
  const form = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT,
    client_id: clientId,
    code_verifier: verifier,
  }
  const first = await oc.token(form)
  if (first.status !== 200) {
    throw new Error(`first exchange should succeed, got ${first.status}: ${JSON.stringify(first.body)}`)
  }
  const second = await oc.token(form)
  if (second.body.error !== 'invalid_grant') {
    throw new Error(`replay should be invalid_grant, got ${JSON.stringify(second.body)}`)
  }
}

// Case 3 — PKCE: exchanging with a verifier that doesn't match the challenge fails.
export async function case3(ctx: Ctx): Promise<void> {
  const clientId = await ctx.newClient()
  const { challenge } = oc.pkcePair() // challenge bound to verifier V1
  const wrongVerifier = oc.pkcePair().verifier // an unrelated verifier
  const authzRes = await oc.authorize({
    cookie: ctx.cookieA,
    clientId,
    redirectUri: REDIRECT,
    scope: 'repo:read',
    challenge,
  })
  const request = oc.consentRequestFrom(authzRes)
  const code = new URL(await oc.consent(ctx.cookieA, request, 'approve')).searchParams.get('code')
  if (!code) throw new Error('approve produced no code')
  const res = await oc.token({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT,
    client_id: clientId,
    code_verifier: wrongVerifier,
  })
  if (res.body.error !== 'invalid_grant') {
    throw new Error(`PKCE mismatch should be invalid_grant, got ${JSON.stringify(res.body)}`)
  }
}

// Case 4 — authorize rejects a redirect_uri not in the client's registered set.
export async function case4(ctx: Ctx): Promise<void> {
  const clientId = await ctx.newClient() // registered with REDIRECT only
  const { challenge } = oc.pkcePair()
  const res = await oc.authorize({
    cookie: ctx.cookieA,
    clientId,
    redirectUri: 'http://localhost:9999/evil',
    scope: 'repo:read',
    challenge,
  })
  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`)
  const body = (await res.json().catch(() => ({}))) as { error_description?: string }
  if (!String(body.error_description ?? '').includes('redirect_uri mismatch')) {
    throw new Error(`expected "redirect_uri mismatch", got ${JSON.stringify(body)}`)
  }
}

// Case 5 — denying consent redirects with error=access_denied and no code.
export async function case5(ctx: Ctx): Promise<void> {
  const clientId = await ctx.newClient()
  const { challenge } = oc.pkcePair()
  const authzRes = await oc.authorize({
    cookie: ctx.cookieA,
    clientId,
    redirectUri: REDIRECT,
    scope: 'repo:read',
    challenge,
  })
  const request = oc.consentRequestFrom(authzRes)
  const url = new URL(await oc.consent(ctx.cookieA, request, 'deny'))
  if (url.searchParams.get('error') !== 'access_denied') {
    throw new Error(`expected access_denied, got ${url.search}`)
  }
  if (url.searchParams.get('code')) throw new Error('deny must not return a code')
}

// Case 6 — non-MCP scopes are filtered out; granted scope is the MCP subset only.
export async function case6(ctx: Ctx): Promise<void> {
  const clientId = await ctx.newClient()
  const tokens = await oc.fullGrant(ctx.cookieA, clientId, REDIRECT, 'repo:read offline_access bogus:scope')
  const granted = tokens.scope.split(' ').filter(Boolean).sort()
  if (JSON.stringify(granted) !== JSON.stringify(['repo:read'])) {
    throw new Error(`expected granted scope ["repo:read"], got ${JSON.stringify(granted)}`)
  }
  // sub-check: an all-bogus request redirects with error=invalid_scope
  const { challenge } = oc.pkcePair()
  const res = await oc.authorize({
    cookie: ctx.cookieA,
    clientId,
    redirectUri: REDIRECT,
    scope: 'bogus:only',
    challenge,
  })
  const loc = res.headers.get('location') ?? ''
  if (!loc.includes('error=invalid_scope')) {
    throw new Error(`all-bogus should redirect with invalid_scope, got ${loc || res.status}`)
  }
}

// Case 7 — refresh-token reuse detection: replaying a rotated refresh token is
// rejected AND revokes the whole family (the rotated refresh and the original
// access token both stop working).
export async function case7(ctx: Ctx): Promise<void> {
  const clientId = await ctx.newClient()
  const t0 = await oc.fullGrant(ctx.cookieA, clientId, REDIRECT)

  const r1 = await oc.token({
    grant_type: 'refresh_token',
    refresh_token: t0.refresh_token,
    client_id: clientId,
  })
  const r1Refresh = r1.body.refresh_token
  if (r1.status !== 200 || !r1.body.access_token || !r1Refresh) {
    throw new Error(`rotation should succeed, got ${r1.status}: ${JSON.stringify(r1.body)}`)
  }

  const replay = await oc.token({
    grant_type: 'refresh_token',
    refresh_token: t0.refresh_token,
    client_id: clientId,
  })
  if (replay.body.error !== 'invalid_grant') {
    throw new Error(`reuse should be invalid_grant, got ${JSON.stringify(replay.body)}`)
  }

  const afterReuse = await oc.token({
    grant_type: 'refresh_token',
    refresh_token: r1Refresh,
    client_id: clientId,
  })
  if (afterReuse.body.error !== 'invalid_grant') {
    throw new Error(`family not revoked — rotated refresh still works: ${JSON.stringify(afterReuse.body)}`)
  }

  const status = await oc.mcpInitStatus(t0.access_token)
  if (status !== 401) {
    throw new Error(`original access token should be 401 after family revoke, got ${status}`)
  }
}

// Case 8 — disconnecting an agent revokes its grant: the access token then 401s.
export async function case8(ctx: Ctx): Promise<void> {
  const clientId = await ctx.newClient()
  const tokens = await oc.fullGrant(ctx.cookieA, clientId, REDIRECT)
  if ((await oc.mcpInitStatus(tokens.access_token)) !== 200) {
    throw new Error('token should work before disconnect')
  }
  const status = await oc.disconnectAgent(ctx.cookieA, clientId)
  if (status !== 200 && status !== 204) throw new Error(`disconnect returned ${status}`)
  if ((await oc.mcpInitStatus(tokens.access_token)) !== 401) {
    throw new Error('token should be 401 after disconnect')
  }
}

// Case 9 — the static-token escape hatch still authenticates with OAuth enabled.
export async function case9(ctx: Ctx): Promise<void> {
  const client = await oc.mcpClient(ctx.seed.staticRawToken)
  try {
    const { tools } = await client.listTools()
    if (tools.length === 0) throw new Error('static token authenticated but advertised no tools')
  } finally {
    await client.close()
  }
}

// Case 10 — real tool call: read_file/get_structure return the seeded doc;
// search_docs is best-effort (no embeddings seeded — any outcome tolerated).
export async function case10(ctx: Ctx): Promise<void> {
  const clientId = await ctx.newClient()
  const tokens = await oc.fullGrant(ctx.cookieA, clientId, REDIRECT)
  const client = await oc.mcpClient(tokens.access_token)
  try {
    const read = await client.callTool({
      name: 'read_file',
      arguments: { repository: ctx.seed.repoId, path: ctx.seed.docPath },
    })
    if ((read as { isError?: boolean }).isError) throw new Error(`read_file errored: ${oc.textOf(read)}`)
    if (!oc.textOf(read).includes('Smoke MCP Fixture')) {
      throw new Error(`read_file content unexpected: ${oc.textOf(read)}`)
    }

    const struct = await client.callTool({
      name: 'get_structure',
      arguments: { repository: ctx.seed.repoId },
    })
    if (!oc.textOf(struct).includes(ctx.seed.docPath)) {
      throw new Error(`get_structure missing ${ctx.seed.docPath}: ${oc.textOf(struct)}`)
    }

    // best-effort: no chunks/embeddings are seeded, so search_docs may throw or
    // return isError; any outcome is tolerated (we only assert it doesn't crash the run).
    await client
      .callTool({ name: 'search_docs', arguments: { repository: ctx.seed.repoId, query: 'fixture' } })
      .catch(() => {})
  } finally {
    await client.close()
  }
}

// Case 11 — cross-user isolation: user B (no group) sees no repos and cannot
// resolve A's repo; the error is the uniform no-leak message.
export async function case11(ctx: Ctx): Promise<void> {
  const clientId = await ctx.newClient()
  const tokens = await oc.fullGrant(ctx.cookieB, clientId, REDIRECT)
  const client = await oc.mcpClient(tokens.access_token)
  try {
    const list = await client.callTool({ name: 'list_repositories', arguments: {} })
    const parsed = JSON.parse(oc.textOf(list)) as unknown[]
    if (!Array.isArray(parsed) || parsed.length !== 0) {
      throw new Error(`B should see no repos, got ${oc.textOf(list)}`)
    }

    const read = await client.callTool({
      name: 'read_file',
      arguments: { repository: ctx.seed.repoId, path: ctx.seed.docPath },
    })
    if (!(read as { isError?: boolean }).isError) throw new Error('B reading A repo should be an error')
    if (!oc.textOf(read).includes('Repository not found or not accessible')) {
      throw new Error(`expected uniform no-leak error, got ${oc.textOf(read)}`)
    }
  } finally {
    await client.close()
  }
}
