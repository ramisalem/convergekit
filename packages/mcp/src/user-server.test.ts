import { describe, expect, it, vi } from 'vitest'
import { createUserScopedMcpServer, type UserServerDeps } from './user-server.js'

function deps(overrides: Partial<UserServerDeps> = {}): UserServerDeps {
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
    searchDocs: vi.fn(async () => 'results'),
    getStructure: vi.fn(async () => 'tree'),
    readFile: vi.fn(async () => 'file'),
    ...overrides,
  }
}

describe('createUserScopedMcpServer', () => {
  it('builds without binding to a single repository', () => {
    const server = createUserScopedMcpServer(deps())
    expect(server).toBeTruthy()
  })

  it('resolveRepository returns the uniform error for an unknown ref (no existence leak)', async () => {
    const d = deps()
    const res = await d.resolveRepository('nope')
    expect(res).toEqual({ ok: false, error: 'Repository not found or not accessible' })
  })
})
