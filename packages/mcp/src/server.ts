/**
 * MCP server factory — JDW-47
 *
 * Creates an MCP server instance scoped to a single repository.
 * The `repositoryId` is always injected server-side from the authenticated
 * request context — it is never accepted from the MCP client, ensuring
 * cross-repo access is impossible.
 *
 * Three tools are exposed:
 *   search_docs  — hybrid semantic + keyword search over indexed chunks
 *   get_structure — file/folder tree for the repository
 *   read_file    — raw content of a single file
 */

import { getDocumentByPath, getDocumentPaths, searchChunks, type SearchOptions } from '@convergekit/db'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

type EnabledMcpTools = {
  getStructure?: boolean
  searchDocs?: boolean
  readFile?: boolean
}

type CreateMcpServerOptions = {
  embeddingOptions?: SearchOptions['embeddingOptions']
  enabledTools?: EnabledMcpTools
}

function toolEnabled(enabledTools: EnabledMcpTools | undefined, key: keyof EnabledMcpTools) {
  return enabledTools?.[key] ?? true
}

export function createMcpServer(
  repositoryId: string,
  options: CreateMcpServerOptions = {},
): McpServer {
  const { embeddingOptions, enabledTools } = options
  const server = new McpServer({
    name: 'convergekit',
    version: '1.0.0',
  })

  // ─── search_docs ────────────────────────────────────────────────────────────

  if (toolEnabled(enabledTools, 'searchDocs')) {
    server.tool(
      'search_docs',
      'Search the repository codebase using hybrid semantic and keyword search. Returns the most relevant code chunks with file path and line numbers.',
      {
        query: z.string().min(1).max(500).describe('The search query'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .default(5)
          .describe('Maximum number of results to return'),
      },
      async ({ query, limit }) => {
        try {
          const results = await searchChunks(repositoryId, query, {
            limit,
            embeddingOptions,
          })
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  results.map((r) => ({
                    path: r.path,
                    startLine: r.startLine,
                    endLine: r.endLine,
                    chunkType: r.chunkType,
                    content: r.content,
                    score: r.score,
                  })),
                  null,
                  2,
                ),
              },
            ],
          }
        } catch (err) {
          const detail =
            err instanceof Error
              ? {
                  message: err.message,
                  name: err.name,
                  cause:
                    (err as { cause?: unknown }).cause instanceof Error
                      ? {
                          message: ((err as { cause: Error }).cause as Error).message,
                          stack: ((err as { cause: Error }).cause as Error).stack,
                        }
                      : (err as { cause?: unknown }).cause,
                  statusCode: (err as { statusCode?: number }).statusCode,
                  url: (err as { url?: string }).url,
                  requestBodyValues: (err as { requestBodyValues?: unknown }).requestBodyValues,
                  responseBody: (err as { responseBody?: string }).responseBody,
                  responseHeaders: (err as { responseHeaders?: Record<string, string> })
                    .responseHeaders,
                  stack: err.stack,
                }
              : err
          console.error('[mcp search_docs] failed', {
            repositoryId,
            query,
            limit,
            error: detail,
          })
          return {
            content: [
              {
                type: 'text' as const,
                text: `search_docs failed: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          }
        }
      },
    )
  }

  // ─── get_structure ───────────────────────────────────────────────────────────

  if (toolEnabled(enabledTools, 'getStructure')) {
    server.tool(
      'get_structure',
      'Get the file and folder structure of the repository. Optionally filter by a path prefix to explore a specific directory.',
      {
        path: z
          .string()
          .optional()
          .describe('Optional path prefix to filter results (e.g. "src/routes")'),
      },
      async ({ path: pathPrefix }) => {
        const rows = await getDocumentPaths(repositoryId, pathPrefix)
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                rows.map((r) => ({
                  path: r.path,
                  programmingLanguage: r.programmingLanguage ?? null,
                })),
                null,
                2,
              ),
            },
          ],
        }
      },
    )
  }

  // ─── read_file ───────────────────────────────────────────────────────────────

  if (toolEnabled(enabledTools, 'readFile')) {
    server.tool(
      'read_file',
      'Read the full content of a file from the repository by its path.',
      {
        path: z
          .string()
          .min(1)
          .describe('The file path relative to the repository root (e.g. src/index.ts)'),
      },
      async ({ path: filePath }) => {
        const doc = await getDocumentByPath(repositoryId, filePath)
        if (!doc) {
          return {
            content: [{ type: 'text' as const, text: `File not found: ${filePath}` }],
            isError: true,
          }
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: doc.content,
            },
          ],
        }
      },
    )
  }

  return server
}
