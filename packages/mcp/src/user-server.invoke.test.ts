import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUserScopedMcpServer, type UserServerDeps } from './user-server.js'

function makeDeps(overrides: Partial<UserServerDeps> = {}): UserServerDeps {
  return {
    listRepositories: vi.fn(async () => [
      {
        id: 'r1',
        name: 'alpha',
        defaultBranch: 'main',
        description: 'Alpha service',
        topics: ['Auth', 'Billing'],
        primaryLanguage: 'TypeScript',
        lastIndexedAt: null,
        status: 'done' as const,
      },
    ]),
    resolveRepository: vi.fn(async (ref: string) =>
      ref === 'r1' || ref === 'alpha'
        ? ({ ok: true as const, repositoryId: 'r1' })
        : ({ ok: false as const, error: 'Repository not found or not accessible' }),
    ),
    searchDocs: vi.fn(async () => 'SEARCH_RESULT'),
    getStructure: vi.fn(async () => 'STRUCTURE'),
    readFile: vi.fn(async () => 'FILE_CONTENT'),
    ...overrides,
  }
}

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('')
}

async function connectedClient(server: ReturnType<typeof createUserScopedMcpServer>) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const c = new Client({ name: 'test', version: '1.0.0' })
  await server.connect(serverTransport)
  await c.connect(clientTransport)
  return c
}

describe('createUserScopedMcpServer (in-memory client invocation)', () => {
  let client: Client
  let server: ReturnType<typeof createUserScopedMcpServer>
  let deps: UserServerDeps

  async function connect(d: UserServerDeps) {
    deps = d
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    server = createUserScopedMcpServer(deps)
    await server.connect(serverTransport)
    client = new Client({ name: 'test', version: '1' })
    await client.connect(clientTransport)
  }

  beforeEach(async () => {
    await connect(makeDeps())
  })

  afterEach(async () => {
    await client.close()
    await server.close()
  })

  it('lists the four registered tools', async () => {
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name).sort()
    expect(names).toEqual(['get_structure', 'list_repositories', 'read_file', 'search_docs'])
  })

  it('list_repositories returns the JSON of listRepositories', async () => {
    const result = (await client.callTool({ name: 'list_repositories', arguments: {} })) as {
      content: Array<{ type: string; text?: string }>
    }
    const expected = JSON.stringify(
      [
        {
          id: 'r1',
          name: 'alpha',
          defaultBranch: 'main',
          description: 'Alpha service',
          topics: ['Auth', 'Billing'],
          primaryLanguage: 'TypeScript',
          lastIndexedAt: null,
          status: 'done',
        },
      ],
      null,
      2,
    )
    expect(textOf(result)).toBe(expected)
    expect(deps.listRepositories).toHaveBeenCalledTimes(1)
  })

  it('search_docs resolves the repository then executes the search', async () => {
    const result = (await client.callTool({
      name: 'search_docs',
      arguments: { repository: 'r1', query: 'q', limit: 5 },
    })) as { content: Array<{ type: string; text?: string }>; isError?: boolean }
    expect(textOf(result)).toContain('SEARCH_RESULT')
    expect(result.isError).toBeFalsy()
    expect(deps.searchDocs).toHaveBeenCalledWith('r1', 'q', 5)
  })

  it('get_structure resolves a repository referenced by name', async () => {
    const result = (await client.callTool({
      name: 'get_structure',
      arguments: { repository: 'alpha' },
    })) as { content: Array<{ type: string; text?: string }>; isError?: boolean }
    expect(textOf(result)).toBe('STRUCTURE')
    expect(result.isError).toBeFalsy()
    expect(deps.getStructure).toHaveBeenCalledWith('r1', undefined)
  })

  it('read_file resolves the repository then reads the file', async () => {
    const result = (await client.callTool({
      name: 'read_file',
      arguments: { repository: 'r1', path: 'a.ts' },
    })) as { content: Array<{ type: string; text?: string }>; isError?: boolean }
    expect(textOf(result)).toBe('FILE_CONTENT')
    expect(result.isError).toBeFalsy()
    expect(deps.readFile).toHaveBeenCalledWith('r1', 'a.ts')
  })

  it('search_docs returns the uniform error without invoking the executor (no existence leak)', async () => {
    const result = (await client.callTool({
      name: 'search_docs',
      arguments: { repository: 'nope', query: 'q' },
    })) as { content: Array<{ type: string; text?: string }>; isError?: boolean }
    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe('Repository not found or not accessible')
    expect(deps.searchDocs).not.toHaveBeenCalled()
  })

  it('read_file returns the uniform error without invoking the executor (no existence leak)', async () => {
    const result = (await client.callTool({
      name: 'read_file',
      arguments: { repository: 'nope', path: 'a.ts' },
    })) as { content: Array<{ type: string; text?: string }>; isError?: boolean }
    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe('Repository not found or not accessible')
    expect(deps.readFile).not.toHaveBeenCalled()
  })
})

describe('enabledTools gating', () => {
  it('always registers list_repositories and hides un-scoped tools', async () => {
    const server = createUserScopedMcpServer(makeDeps(), {
      enabledTools: { searchDocs: true, getStructure: false, readFile: false },
    })
    const c = await connectedClient(server)
    const names = (await c.listTools()).tools.map((t) => t.name).sort()
    expect(names).toEqual(['list_repositories', 'search_docs'])
    await c.close()
  })

  it('exposes only list_repositories when every scope flag is off', async () => {
    const server = createUserScopedMcpServer(makeDeps(), {
      enabledTools: { searchDocs: false, getStructure: false, readFile: false },
    })
    const c = await connectedClient(server)
    const names = (await c.listTools()).tools.map((t) => t.name)
    expect(names).toEqual(['list_repositories'])
    await c.close()
  })

  it('defaults to all tools when options are omitted (OAuth call-site behavior)', async () => {
    const server = createUserScopedMcpServer(makeDeps())
    const c = await connectedClient(server)
    const names = (await c.listTools()).tools.map((t) => t.name).sort()
    expect(names).toEqual(['get_structure', 'list_repositories', 'read_file', 'search_docs'])
    await c.close()
  })

  it('a gated-off tool is uncallable, not merely unlisted', async () => {
    const deps = makeDeps()
    const server = createUserScopedMcpServer(deps, {
      enabledTools: { searchDocs: false, getStructure: false, readFile: false },
    })
    const c = await connectedClient(server)
    const result = (await c.callTool({
      name: 'read_file',
      arguments: { repository: 'r1', path: 'a.ts' },
    })) as { content: Array<{ type: string; text?: string }>; isError?: boolean }
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('not found')
    expect(deps.readFile).not.toHaveBeenCalled()
    await c.close()
  })
})
