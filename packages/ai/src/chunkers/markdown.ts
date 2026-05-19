import type { CodeChunk } from './code.js'

// ─── Markdown / RST splitter ──────────────────────────────────────────────────
//
// Splits content on H2 (##) and H3 (###) heading boundaries.
// Each section — heading line through the line before the next heading — is
// returned as a `section` chunk.  Content before the first heading is emitted
// as a preamble chunk if it is non-empty.

const HEADING_RE = /^#{2,3}\s/

export function chunkMarkdown(content: string): CodeChunk[] {
  const lines = content.split('\n')
  const chunks: CodeChunk[] = []

  let sectionStart = 0
  let inSection = false

  for (let i = 0; i < lines.length; i++) {
    if (HEADING_RE.test(lines[i])) {
      if (inSection || sectionStart < i) {
        // Flush previous section
        const sectionLines = lines.slice(sectionStart, i)
        const trimmed = sectionLines.join('\n').trim()
        if (trimmed) {
          chunks.push({
            content: trimmed,
            startLine: sectionStart,
            endLine: i - 1,
            chunkType: 'section',
          })
        }
      }
      sectionStart = i
      inSection = true
    }
  }

  // Flush final section
  if (sectionStart < lines.length) {
    const sectionLines = lines.slice(sectionStart)
    const trimmed = sectionLines.join('\n').trim()
    if (trimmed) {
      chunks.push({
        content: trimmed,
        startLine: sectionStart,
        endLine: lines.length - 1,
        chunkType: 'section',
      })
    }
  }

  return chunks
}
