import type { CodeChunk } from './code.js'

// ─── Plain-text windowed splitter ─────────────────────────────────────────────
//
// Splits text into ~512-token windows with 50-token overlap.
// Token count is approximated as: chars / 4  (matches common BPE heuristic).
// Each window is emitted as a `block` chunk.

const CHARS_PER_TOKEN = 4
const WINDOW_TOKENS = 512
const OVERLAP_TOKENS = 50

const WINDOW_CHARS = WINDOW_TOKENS * CHARS_PER_TOKEN   // 2048
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN // 200

export function chunkText(content: string): CodeChunk[] {
  const chunks: CodeChunk[] = []

  let offset = 0
  while (offset < content.length) {
    const end = Math.min(offset + WINDOW_CHARS, content.length)
    const slice = content.slice(offset, end)

    // Count lines for startLine / endLine
    const startLine = content.slice(0, offset).split('\n').length - 1
    const endLine = startLine + slice.split('\n').length - 1

    chunks.push({
      content: slice,
      startLine,
      endLine,
      chunkType: 'block',
    })

    if (end >= content.length) break
    offset = end - OVERLAP_CHARS
  }

  return chunks
}
