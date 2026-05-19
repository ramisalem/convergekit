import type { CodeChunk } from './code.js'

// ─── Config splitter ──────────────────────────────────────────────────────────
//
// Splits JSON, YAML, and TOML files by top-level key.
// Each key + its subtree is emitted as a `config` chunk.
// Falls back to a single chunk containing the full content on parse failure.

// ─── JSON ─────────────────────────────────────────────────────────────────────

function chunkJson(content: string): CodeChunk[] {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(content) as Record<string, unknown>
  } catch {
    return [{ content, startLine: 0, endLine: content.split('\n').length - 1, chunkType: 'config' }]
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return [{ content, startLine: 0, endLine: content.split('\n').length - 1, chunkType: 'config' }]
  }

  return Object.entries(parsed).map(([key, value]) => ({
    content: JSON.stringify({ [key]: value }, null, 2),
    startLine: 0,
    endLine: 0,
    chunkType: 'config' as const,
  }))
}

// ─── YAML — line-based top-level key extraction ───────────────────────────────
// Avoids an external YAML parser dependency.
// A top-level key is any line that starts with a non-space, non-comment,
// non-document-marker character and contains a colon, or is a bare string key.

const YAML_TOP_LEVEL_KEY_RE = /^([A-Za-z0-9_"'`-][^:]*?):/

function chunkYaml(content: string): CodeChunk[] {
  const lines = content.split('\n')
  const sections: Array<{ start: number; end: number }> = []
  let currentStart: number | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Skip empty lines, comments, and document markers
    if (!line.trim() || line.startsWith('#') || line === '---' || line === '...') continue

    if (YAML_TOP_LEVEL_KEY_RE.test(line)) {
      if (currentStart !== null) {
        sections.push({ start: currentStart, end: i - 1 })
      }
      currentStart = i
    }
  }

  if (currentStart !== null) {
    sections.push({ start: currentStart, end: lines.length - 1 })
  }

  if (sections.length === 0) {
    return [{ content, startLine: 0, endLine: lines.length - 1, chunkType: 'config' }]
  }

  return sections.map(({ start, end }) => ({
    content: lines.slice(start, end + 1).join('\n').trimEnd(),
    startLine: start,
    endLine: end,
    chunkType: 'config' as const,
  }))
}

// ─── TOML — section-based splitting ──────────────────────────────────────────
// Splits on [section] and [[array]] header lines.

const TOML_SECTION_RE = /^\[/

function chunkToml(content: string): CodeChunk[] {
  const lines = content.split('\n')
  const sections: Array<{ start: number; end: number }> = []
  let currentStart = 0
  let foundSection = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (TOML_SECTION_RE.test(line)) {
      if (foundSection) {
        sections.push({ start: currentStart, end: i - 1 })
      } else if (currentStart < i) {
        // Preamble before first section
        const preamble = lines.slice(0, i).join('\n').trim()
        if (preamble) sections.push({ start: 0, end: i - 1 })
      }
      currentStart = i
      foundSection = true
    }
  }

  sections.push({ start: currentStart, end: lines.length - 1 })

  if (sections.length === 0) {
    return [{ content, startLine: 0, endLine: lines.length - 1, chunkType: 'config' }]
  }

  return sections
    .map(({ start, end }) => ({
      content: lines.slice(start, end + 1).join('\n').trimEnd(),
      startLine: start,
      endLine: end,
      chunkType: 'config' as const,
    }))
    .filter((c) => c.content.trim().length > 0)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type ConfigFormat = 'json' | 'yaml' | 'toml'

export function chunkConfig(content: string, format: ConfigFormat): CodeChunk[] {
  switch (format) {
    case 'json':
      return chunkJson(content)
    case 'yaml':
      return chunkYaml(content)
    case 'toml':
      return chunkToml(content)
  }
}
