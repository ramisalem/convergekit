const WHOLE_DOCUMENT_FENCE_RE = /^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/

export function sanitizeGeneratedWikiContent(content: string): string {
  const stripped = content.match(WHOLE_DOCUMENT_FENCE_RE)?.[1] ?? content
  const sanitized = stripped.trim()

  if (!sanitized) {
    throw new Error('Wiki generation returned empty content')
  }

  return sanitized
}
