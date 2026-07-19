import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { searchDocsQuerySchema } from './tool-schemas.js'

export type RepoMeta = {
  id: string
  name: string
  defaultBranch: string
  description: string | null
  topics: string[]
  primaryLanguage: string | null
  lastIndexedAt: string | null
  status: 'pending' | 'processing' | 'done' | 'failed'
}

export type ResolveResult = { ok: true; repositoryId: string } | { ok: false; error: string }

export type UserServerDeps = {
  listRepositories: () => Promise<RepoMeta[]>
  resolveRepository: (ref: string) => Promise<ResolveResult>
  searchDocs: (repositoryId: string, query: string, limit: number) => Promise<string>
  getStructure: (repositoryId: string, pathPrefix?: string) => Promise<string>
  readFile: (repositoryId: string, path: string) => Promise<string>
}

// Flag names match mcpToolsForScopes() in the API layer, which computes them from
// token scopes and passes booleans in — this package stays free of token policy.
export type UserServerToolFlags = {
  searchDocs: boolean
  getStructure: boolean
  readFile: boolean
}

export type UserServerOptions = {
  enabledTools?: UserServerToolFlags
}

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] })
const errText = (value: string) => ({
  content: [{ type: 'text' as const, text: value }],
  isError: true,
})

export function createUserScopedMcpServer(
  deps: UserServerDeps,
  options: UserServerOptions = {},
): McpServer {
  const enabled = options.enabledTools ?? { searchDocs: true, getStructure: true, readFile: true }
  const server = new McpServer({ name: 'convergekit', version: '1.0.0' })

  server.tool(
    'list_repositories',
    'List the repositories you can access in ConvergeKit. Each entry includes a `description` (what the repo is) and `topics` (feature areas) — use these to pick the right repository and to seed `search_docs` queries. Pass a returned `id` (preferred) or exact `name` as the `repository` argument for the other tools.',
    {},
    async () => text(JSON.stringify(await deps.listRepositories(), null, 2)),
  )

  const repositoryArg = z
    .string()
    .min(1)
    .describe('Repository id (preferred) or exact repository name from list_repositories')

  if (enabled.searchDocs) {
    server.tool(
      'search_docs',
      'Search a repository using hybrid semantic + keyword search.',
      {
        repository: repositoryArg,
        query: searchDocsQuerySchema,
        limit: z.number().int().min(1).max(20).optional().default(5),
      },
      async ({ repository, query, limit }) => {
        const resolved = await deps.resolveRepository(repository)
        if (!resolved.ok) return errText(resolved.error)
        return text(await deps.searchDocs(resolved.repositoryId, query, limit))
      },
    )
  }

  if (enabled.getStructure) {
    server.tool(
      'get_structure',
      'Get the file/folder structure of a repository, optionally filtered by a path prefix.',
      { repository: repositoryArg, path: z.string().optional() },
      async ({ repository, path }) => {
        const resolved = await deps.resolveRepository(repository)
        if (!resolved.ok) return errText(resolved.error)
        return text(await deps.getStructure(resolved.repositoryId, path))
      },
    )
  }

  if (enabled.readFile) {
    server.tool(
      'read_file',
      'Read the full content of a file in a repository by path.',
      { repository: repositoryArg, path: z.string().min(1) },
      async ({ repository, path }) => {
        const resolved = await deps.resolveRepository(repository)
        if (!resolved.ok) return errText(resolved.error)
        return text(await deps.readFile(resolved.repositoryId, path))
      },
    )
  }

  return server
}
