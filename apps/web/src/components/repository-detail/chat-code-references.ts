const CODE_REFERENCE_PATTERN =
  /\b((?:(?:[\w.-]+\/)+)?[\w.-]+\.(?:arb|coffee|css|erb|gemspec|graphql|html|js|json|jsx|md|rb|rake|rspec|scss|sh|sql|ts|tsx|txt|yml|yaml)(?::\d+(?:[-–—]\d+)?)?)/g
const CODE_IDENTIFIER_PATTERN =
  /\b([A-Z][A-Za-z0-9]*(?:::[A-Z][A-Za-z0-9]*)+|[A-Z][A-Za-z0-9_$]{1,}\.[a-z_$][\w$]*|[A-Za-z_$][\w$]*\.[a-z_$][\w$]*(?:_[a-z0-9$]+)+|[A-Z][A-Za-z0-9]*(?:Application|Client|Consumer|Controller|Handler|Job|Main|Model|Module|Policy|Process|Repository|Server|Service|Validator|Worker)|[A-Z][A-Za-z0-9]*(?=\s+(?:class|controller|method|module|service))|[a-z][a-z0-9]+(?:_[a-z0-9]+)+[!?=]?|(?:new|create|update|destroy|show|index)(?=\s+method))\b/g
const PROTECTED_MARKDOWN_SEGMENT_PATTERN = /(`[^`\n]*`|\[[^\]\n]+\]\([^)]+\))/g
const FENCE_PATTERN = /^\s*```/
const LINE_RANGE_PATTERN = /:(\d+(?:[-–—]\d+)?)$/

export type CodeReference = {
  href: string
  lineRange: string | null
  path: string
  reference: string
}

function isProtectedMarkdownSegment(segment: string) {
  return (
    /^`[^`\n]*`$/.test(segment) ||
    /^\[[^\]\n]+\]\([^)]+\)$/.test(segment)
  )
}

function getCodeReferenceHref(reference: string) {
  return `#code-reference-${encodeURIComponent(reference)}`
}

function parseCodeReference(reference: string): CodeReference {
  const lineRangeMatch = reference.match(LINE_RANGE_PATTERN)
  const lineRange = lineRangeMatch?.[1] ?? null
  const path =
    lineRange && lineRangeMatch ? reference.slice(0, -lineRangeMatch[0].length) : reference

  return {
    href: getCodeReferenceHref(reference),
    lineRange,
    path,
    reference,
  }
}

function markCodeIdentifiers(segment: string) {
  return segment.replace(CODE_IDENTIFIER_PATTERN, (identifier) => {
    return `\`${identifier}\``
  })
}

function linkPlainTextReferences(segment: string) {
  let result = ''
  let lastIndex = 0

  for (const match of segment.matchAll(CODE_REFERENCE_PATTERN)) {
    const reference = match[1]
    const start = match.index ?? 0

    result += markCodeIdentifiers(segment.slice(lastIndex, start))
    result += `[${reference}](${getCodeReferenceHref(reference)})`
    lastIndex = start + reference.length
  }

  result += markCodeIdentifiers(segment.slice(lastIndex))
  return result
}

function collectPlainTextReferences(segment: string, references: Map<string, CodeReference>) {
  for (const match of segment.matchAll(CODE_REFERENCE_PATTERN)) {
    const reference = match[1]

    if (!references.has(reference)) {
      references.set(reference, parseCodeReference(reference))
    }
  }
}

function linkReferencesInMarkdownLine(line: string) {
  return line
    .split(PROTECTED_MARKDOWN_SEGMENT_PATTERN)
    .map((segment) =>
      isProtectedMarkdownSegment(segment) ? segment : linkPlainTextReferences(segment),
    )
    .join('')
}

function collectReferencesInMarkdownLine(line: string, references: Map<string, CodeReference>) {
  line
    .split(PROTECTED_MARKDOWN_SEGMENT_PATTERN)
    .filter((segment) => !isProtectedMarkdownSegment(segment))
    .forEach((segment) => collectPlainTextReferences(segment, references))
}

export function linkCodeReferences(content: string) {
  let inCodeFence = false

  return content
    .split('\n')
    .map((line) => {
      if (FENCE_PATTERN.test(line)) {
        inCodeFence = !inCodeFence
        return line
      }

      return inCodeFence ? line : linkReferencesInMarkdownLine(line)
    })
    .join('\n')
}

export function extractCodeReferences(content: string) {
  const references = new Map<string, CodeReference>()
  let inCodeFence = false

  content.split('\n').forEach((line) => {
    if (FENCE_PATTERN.test(line)) {
      inCodeFence = !inCodeFence
      return
    }

    if (!inCodeFence) {
      collectReferencesInMarkdownLine(line, references)
    }
  })

  return Array.from(references.values())
}
