export type RelatedPageLink = {
  title: string
  slug: string
}

const RELATED_PAGES_HEADING_RE = /^##\s+Related Pages\s*$/gim
const MARKDOWN_LINK_LINE_RE = /^(\s*(?:[-*+]|\d+\.)\s*)?\[([^\]]+)\]\(([^)]*)\)(\s*)$/
const RELATED_PAGE_LINE_RE = /^(\s*(?:[-*+]|\d+\.)\s*)?(.+?)(\s*)$/
const RELATED_PAGE_STOP_WORDS = new Set([
  'and',
  'api',
  'component',
  'components',
  'for',
  'in',
  'management',
  'of',
  'page',
  'pages',
  'service',
  'services',
  'system',
  'the',
  'to',
  'with',
])

function normalizeTitle(title: string) {
  return title.trim().replace(/\s+/g, ' ').toLowerCase()
}

function slugifyTitle(title: string) {
  return normalizeTitle(title)
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildTitleMap(pages: RelatedPageLink[]) {
  const titleMap = new Map<string, RelatedPageLink>()
  for (const page of pages) {
    titleMap.set(normalizeTitle(page.title), page)
    titleMap.set(slugifyTitle(page.title), page)
  }
  return titleMap
}

function tokensForTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/&/g, 'and')
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !RELATED_PAGE_STOP_WORDS.has(token))
}

function findPageForTitle(
  title: string,
  titleMap: Map<string, RelatedPageLink>,
  pages: RelatedPageLink[],
) {
  const exactMatch = titleMap.get(normalizeTitle(title)) ?? titleMap.get(slugifyTitle(title))
  if (exactMatch) return exactMatch

  const titleTokens = tokensForTitle(title)
  if (titleTokens.length === 0) return null

  let bestPage: RelatedPageLink | null = null
  let bestScore = 0
  for (const page of pages) {
    const pageTokens = tokensForTitle(page.title)
    const score = titleTokens.filter((token) =>
      pageTokens.some((pageToken) => token === pageToken || token.startsWith(pageToken) || pageToken.startsWith(token)),
    ).length

    if (score > bestScore) {
      bestScore = score
      bestPage = page
    }
  }

  return bestScore > 0 ? bestPage : null
}

function findLastRelatedPagesHeading(content: string) {
  let headingIndex = -1
  RELATED_PAGES_HEADING_RE.lastIndex = 0
  for (const match of content.matchAll(RELATED_PAGES_HEADING_RE)) {
    headingIndex = match.index ?? -1
  }
  return headingIndex
}

export function linkRelatedPagesInMarkdown(content: string, pages: RelatedPageLink[]) {
  const relatedIdx = findLastRelatedPagesHeading(content)
  if (relatedIdx === -1 || pages.length === 0) return content

  const before = content.slice(0, relatedIdx)
  const relatedSection = content.slice(relatedIdx)
  const titleMap = buildTitleMap(pages)

  const linkedSection = relatedSection
    .split('\n')
    .map((line, index) => {
      if (index === 0 || line.trim() === '') return line

      const existingLink = line.match(MARKDOWN_LINK_LINE_RE)
      if (existingLink) {
        const [, prefix = '', title, href, suffix = ''] = existingLink
        const page = findPageForTitle(title, titleMap, pages)
        if (!page) return line
        if (href.trim() !== '' && href.trim() === page.slug) return line

        return `${prefix}[${title}](${page.slug})${suffix}`
      }

      const plainLine = line.match(RELATED_PAGE_LINE_RE)
      if (!plainLine) return line

      const [, prefix = '', rawTitle, suffix = ''] = plainLine
      const title = rawTitle.trim()
      if (!title || title.includes('](')) return line

      const page = findPageForTitle(title, titleMap, pages)
      if (!page) return line

      return `${prefix}[${title}](${page.slug})${suffix}`
    })
    .join('\n')

  return before + linkedSection
}
