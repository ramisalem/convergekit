import { linkRelatedPagesInMarkdown, type RelatedPageLink } from './related-pages'

const WHOLE_DOCUMENT_FENCE_RE = /^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/
const EXISTING_LINK_RE = /\[[^\]]+\]\([^)]*\)/g
const FENCED_BLOCK_RE = /```[\s\S]*?```/g
const INLINE_CODE_RE = /`[^`\n]+`/g
const DIAGRAM_LABEL_RE = /(?:^|\n)(Mermaid Diagram:|Diagram:)\s*((?:graph|flowchart|sequenceDiagram|classDiagram|erDiagram)\b[^\n]*)(?=\n|$)/g
const BARE_CITATION_RE =
  /(^|[\s(])((?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.[A-Za-z0-9]+:\d+(?:-\d+)?)(?=([),.;:]?)(?:\s|$))/g

function stripWholeDocumentFences(content: string): string {
  const match = content.match(WHOLE_DOCUMENT_FENCE_RE)
  return match ? match[1].trim() : content.trim()
}

function withProtectedSegments(
  content: string,
  pattern: RegExp,
  tokenPrefix: string,
  segments: string[],
): string {
  return content.replace(pattern, (match) => {
    const token = `__${tokenPrefix}_${segments.length}__`
    segments.push(match)
    return token
  })
}

function restoreSegments(content: string, tokenPrefix: string, segments: string[]): string {
  let restored = content
  for (let i = 0; i < segments.length; i++) {
    restored = restored.replace(`__${tokenPrefix}_${i}__`, segments[i]!)
  }
  return restored
}

function normalizeCitationSegment(segment: string): string {
  const trimmed = segment.trim()
  if (!trimmed || trimmed.includes('](')) return segment

  return trimmed.replace(BARE_CITATION_RE, (_match, prefix: string, citation: string) => {
    return `${prefix}[${citation}]()`
  })
}

function normalizeSourcesLines(content: string): string {
  return content.replace(/(Sources?|Citations?):\s+([^\n]+)/g, (_match, label: string, rest: string) => {
    const normalized = rest
      .split(',')
      .map((part) => normalizeCitationSegment(part))
      .join(', ')

    return `${label}: ${normalized}`
  })
}

function normalizeBareCitations(content: string): string {
  return content.replace(
    BARE_CITATION_RE,
    (_match, prefix: string, citation: string, trailingPunctuation: string) =>
      `${prefix}[${citation}]()${trailingPunctuation}`,
  )
}

function repairMermaidBlocks(content: string): string {
  return content.replace(DIAGRAM_LABEL_RE, (_match, label: string, diagram: string) => {
    return `\n${label}\n\`\`\`mermaid\n${diagram.trim()}\n\`\`\``
  }).trimStart()
}

export function normalizeWikiMarkdown(
  content: string,
  relatedPages: RelatedPageLink[] = [],
): string {
  const links: string[] = []
  const fencedBlocks: string[] = []
  const inlineCode: string[] = []

  let normalized = stripWholeDocumentFences(content)
  normalized = withProtectedSegments(normalized, EXISTING_LINK_RE, 'WIKI_LINK', links)
  normalized = withProtectedSegments(normalized, FENCED_BLOCK_RE, 'WIKI_FENCE', fencedBlocks)
  normalized = withProtectedSegments(normalized, INLINE_CODE_RE, 'WIKI_INLINE', inlineCode)

  normalized = normalizeSourcesLines(normalized)
  normalized = normalizeBareCitations(normalized)
  normalized = repairMermaidBlocks(normalized)

  normalized = restoreSegments(normalized, 'WIKI_INLINE', inlineCode)
  normalized = restoreSegments(normalized, 'WIKI_FENCE', fencedBlocks)
  normalized = restoreSegments(normalized, 'WIKI_LINK', links)
  normalized = linkRelatedPagesInMarkdown(normalized, relatedPages)

  return normalized
}
