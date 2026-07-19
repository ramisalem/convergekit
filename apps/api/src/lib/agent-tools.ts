/**
 * Vercel AI SDK tools for the RAG chat agent — JDW-45
 *
 * All tools are scoped to a single repositoryId so the model cannot
 * access documents from other repositories.
 */

import type { EmbeddingModelOptions } from '@convergekit/ai'
import type { RetrievalPolicy } from '@convergekit/db'
import { getDocumentByPath, getDocumentPaths, searchChunks } from '@convergekit/db'
import { searchDocsQuerySchema } from '@convergekit/mcp'
import { tool } from 'ai'
import { z } from 'zod'

const MAX_SEARCH_RESULT_CONTENT_CHARS = 8_000
const MAX_READ_FILE_CONTENT_CHARS = 16_000
const MAX_STRUCTURE_PATHS = 400

function truncateContent(content: string, maxChars: number) {
  if (content.length <= maxChars) {
    return {
      content,
      truncated: false,
      omittedCharacters: 0,
    }
  }

  return {
    content: content.slice(0, maxChars),
    truncated: true,
    omittedCharacters: content.length - maxChars,
  }
}

// ─── searchDocsTool ────────────────────────────────────────────────────────────

export function searchDocsTool(
  repositoryId: string,
  embeddingOptions?: EmbeddingModelOptions,
  retrievalPolicy?: RetrievalPolicy,
) {
  return tool({
    description:
      'Search the codebase for relevant code snippets and documentation using hybrid semantic + keyword search. Returns the top matching chunks with file path and line numbers for source attribution.',
    inputSchema: z.object({
      query: searchDocsQuerySchema,
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .default(5)
        .describe('Number of results to return'),
      chunkType: z
        .enum(['function', 'class', 'method', 'module', 'block', 'comment'])
        .optional()
        .describe('Filter results to a specific chunk type'),
    }),
    execute: async ({ query, limit, chunkType }) => {
      const results = await searchChunks(repositoryId, query, {
        limit,
        chunkType,
        embeddingOptions,
        retrievalPolicy,
      })
      return results.map((r) => {
        const truncated = truncateContent(r.content, MAX_SEARCH_RESULT_CONTENT_CHARS)

        return {
          path: r.path,
          startLine: r.startLine,
          endLine: r.endLine,
          chunkType: r.chunkType,
          content: truncated.content,
          ...(truncated.truncated
            ? {
                contentTruncated: true,
                omittedCharacters: truncated.omittedCharacters,
              }
            : {}),
          score: r.score,
          normalizedHybridScore: r.normalizedHybridScore,
          evidenceTier: r.evidenceTier,
          evidenceKind: r.evidenceKind,
          evidenceAlignmentStatus: r.evidenceAlignmentStatus,
          retrievalIntent: r.retrievalIntent,
          retrievalLane: r.retrievalLane,
        }
      })
    },
  })
}

// ─── readFileTool ──────────────────────────────────────────────────────────────

export function readFileTool(repositoryId: string) {
  return tool({
    description:
      'Read raw content of a file from the repository by its path. Large files are returned as a bounded preview with truncation metadata; use searchDocs for targeted chunks.',
    inputSchema: z.object({
      path: z
        .string()
        .min(1)
        .describe('The file path relative to the repository root (e.g. src/index.ts)'),
    }),
    execute: async ({ path }) => {
      const doc = await getDocumentByPath(repositoryId, path)
      if (!doc) return { error: `File not found: ${path}` }
      const truncated = truncateContent(doc.content, MAX_READ_FILE_CONTENT_CHARS)

      return {
        path: doc.path,
        programmingLanguage: doc.programmingLanguage ?? null,
        content: truncated.content,
        truncated: truncated.truncated,
        ...(truncated.truncated
          ? {
              originalCharacters: doc.content.length,
              omittedCharacters: truncated.omittedCharacters,
              note: 'File content was truncated to keep the chat stream within model limits. Use searchDocs for narrower context from this file.',
            }
          : {}),
      }
    },
  })
}

// ─── getStructureTool ─────────────────────────────────────────────────────────

export function getStructureTool(repositoryId: string) {
  return tool({
    description:
      'Get a bounded file and folder structure listing for the repository. Optionally filter by a path prefix to explore a specific directory.',
    inputSchema: z.object({
      pathPrefix: z
        .string()
        .optional()
        .describe(
          'Optional path prefix to filter results (e.g. "src/routes" to list only that directory)',
        ),
    }),
    execute: async ({ pathPrefix }) => {
      const rows = await getDocumentPaths(repositoryId, pathPrefix)
      const paths = rows.slice(0, MAX_STRUCTURE_PATHS).map((r) => ({
        path: r.path,
        programmingLanguage: r.programmingLanguage ?? null,
      }))
      const omittedPaths = Math.max(0, rows.length - paths.length)

      return {
        paths,
        count: rows.length,
        truncated: omittedPaths > 0,
        ...(omittedPaths > 0
          ? {
              omittedPaths,
              note: 'Path list was truncated to keep the chat stream within model limits. Use pathPrefix to inspect a narrower directory.',
            }
          : {}),
      }
    },
  })
}
