import { z } from 'zod'

/**
 * Maximum length of a `search_docs` query, in characters.
 *
 * Sized to accommodate MCP clients that include natural-language task
 * context plus referenced file names in a single query. Well under the
 * embedding model's input cap (text-embedding-3-small accepts ~8K tokens;
 * 4,000 chars ≈ 1,000 tokens).
 */
export const MAX_SEARCH_QUERY_CHARS = 4_000

export const searchDocsQuerySchema = z
  .string()
  .min(1)
  .max(MAX_SEARCH_QUERY_CHARS)
  .describe(
    `The search query. May include natural-language task context plus referenced file names, up to ${MAX_SEARCH_QUERY_CHARS} characters.`,
  )
