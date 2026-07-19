import { closeDbConnection, db, mcpTokens, repositories } from '@convergekit/db'
import { inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { makeFixture } from './support.js'

// Real-Postgres integration suite (Task 15b): the MCP serving-path
// discriminator (from the Task 5 review) — proof that a grandfathered
// repo-scoped static token and a user-level static token are served by
// genuinely DIFFERENT MCP server variants, driven through the REAL
// `/api/mcp` Streamable HTTP route (full initialize + tools/list handshake,
// in-process via `app.request()`), not just at the middleware/context level.
//
// This turned out to be practical in-process: `WebStandardStreamableHTTPServerTransport`
// operates on Web-standard Request/Response, which `app.request()` produces
// natively. The one wrinkle is that non-JSON-response-mode POSTs return an
// SSE-formatted body (`event: message\ndata: {...}\n\n`) even for a single
// request/response — `extractSseJson` below unwraps that.
//
// Connects to the SHARED local dev database via DATABASE_URL. Every seed is
// tagged `it-15b-mcp-*` and torn down by exact id.

const fx = makeFixture('mcp')

function extractSseJson(text: string): { result?: { tools?: { name: string }[] } } {
  const dataLines = text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice('data: '.length))
  if (dataLines.length === 0) {
    throw new Error(`extractSseJson: no SSE "data:" line found in response body: ${text}`)
  }
  return JSON.parse(dataLines[dataLines.length - 1]!)
}

async function mcpToolsList(
  app: ReturnType<typeof createApp>,
  rawToken: string,
): Promise<string[]> {
  const initRes = await app.request('/api/mcp', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${rawToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'it-15b-mcp-serving', version: '1.0.0' },
      },
    }),
  })
  expect(initRes.status).toBe(200)
  const sessionId = initRes.headers.get('mcp-session-id')
  expect(sessionId).toBeTruthy()

  const listRes = await app.request('/api/mcp', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${rawToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'mcp-session-id': sessionId!,
      'mcp-protocol-version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  })
  expect(listRes.status).toBe(200)
  const listJson = extractSseJson(await listRes.text())
  return listJson.result?.tools?.map((t) => t.name) ?? []
}

describe('MCP serving-path discriminator: user-level vs grandfathered repo-scoped static tokens (real Postgres + real MCP handshake)', () => {
  const seededUserIds: string[] = []
  const seededRepoIds: string[] = []
  const seededTokenIds: string[] = []
  const seededGroupIds: string[] = []

  beforeAll(async () => {
    await fx.sweepLeftovers()
  })

  afterAll(async () => {
    if (seededTokenIds.length > 0) {
      await db.delete(mcpTokens).where(inArray(mcpTokens.id, seededTokenIds))
    }
    if (seededRepoIds.length > 0) {
      await db.delete(repositories).where(inArray(repositories.id, seededRepoIds))
    }
    await fx.deleteUsers(seededUserIds)
    await fx.deleteGroups(seededGroupIds)
    await closeDbConnection()
  })

  it('a user-level token (repositoryId null) gets a user-scoped server whose tools/list HAS list_repositories', async () => {
    const owner = await fx.seedUser({ ciTokensEnabled: true })
    seededUserIds.push(owner.id)
    const { row: token, rawToken } = await fx.seedTokenWithSecret(owner.id, { repositoryId: null })
    seededTokenIds.push(token.id)

    const app = createApp()
    const toolNames = await mcpToolsList(app, rawToken)

    expect(toolNames).toContain('list_repositories')
  }, 20000)

  it('a grandfathered repo-scoped token (repositoryId set) gets a repo-implied server whose tools/list LACKS list_repositories', async () => {
    // Owner is an admin so scopedRepositoryIds() grants it access to the repo
    // without needing a group + group_repositories fixture. The non-admin
    // (group-scoped) variant — the shape the real grandfathered population
    // has — is the next test.
    const owner = await fx.seedUser({ role: 'admin' })
    seededUserIds.push(owner.id)
    const repo = await fx.seedRepository(owner.id)
    seededRepoIds.push(repo.id)
    const { row: token, rawToken } = await fx.seedTokenWithSecret(owner.id, {
      repositoryId: repo.id,
    })
    seededTokenIds.push(token.id)

    const app = createApp()
    const toolNames = await mcpToolsList(app, rawToken)

    expect(toolNames).not.toContain('list_repositories')
    // Sanity: still a real, working repo-scoped server (proves the discriminator
    // is "different server variant", not merely "auth failed and served nothing").
    expect(toolNames).toEqual(expect.arrayContaining(['search_docs', 'get_structure', 'read_file']))
  }, 20000)

  it('a NON-admin grandfathered token (group-scoped repo access) is served the same repo-implied server: handshake succeeds, tools/list LACKS list_repositories', async () => {
    // This — not the admin variant above — is the production shape of the
    // grandfathered population (the ~19 non-admin engineers still on per-repo
    // tokens): requireMcpToken's live-access check goes through
    // scopedRepositoryIds' NON-admin branch (user.groupId -> group_repositories),
    // so both the authn gate and the serving path are exercised as they would
    // be for a real engineer's token.
    const group = await fx.seedGroup()
    seededGroupIds.push(group.id)
    const owner = await fx.seedUser({ role: 'user', groupId: group.id })
    seededUserIds.push(owner.id)
    const repo = await fx.seedRepository(owner.id)
    seededRepoIds.push(repo.id)
    await fx.seedGroupRepository(group.id, repo.id)
    const { row: token, rawToken } = await fx.seedTokenWithSecret(owner.id, {
      repositoryId: repo.id,
    })
    seededTokenIds.push(token.id)

    const app = createApp()
    // mcpToolsList asserts both handshake responses are 200 internally —
    // a scoping failure would surface as a 401 on initialize.
    const toolNames = await mcpToolsList(app, rawToken)

    expect(toolNames).not.toContain('list_repositories')
    expect(toolNames).toEqual(expect.arrayContaining(['search_docs', 'get_structure', 'read_file']))
  }, 20000)
})
