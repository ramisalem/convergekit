/**
 * Parsers for the hub repo's plain-text configuration: the repo list and per-repo profiles.
 * Pure functions, no I/O; `loadHub` in github.ts feeds them file contents.
 */

export type FactoryProfile = {
  repo: string | null
  product: string | null
  app: string | null
  integrationBranch: string | null
  productionBranch: string | null
  stagingSite: string | null
  people: {
    productOwners: string[]
    qa: string[]
    developers: string[]
    reviewAccounts: string[]
    umbrellaApprovals: number | null
  }
  /** Every key/value row of every two-column table, by section, as written. */
  sections: Record<string, Record<string, string>>
}

/** Parse `owner/name` lines, skipping blanks and `#` comments. Order is kept, duplicates dropped. */
export function parseRepoList(text: string): string[] {
  const repos: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(line)) continue
    if (!repos.includes(line)) repos.push(line)
  }
  return repos
}

const NOT_RECORDED = /^not recorded yet\b/i

function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return inner.split('|').map((cell) => cell.trim())
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

/** Read the two-column `| Key | Value |` tables under each `## Heading`. */
export function parseKeyValueSections(markdown: string): Record<string, Record<string, string>> {
  const sections: Record<string, Record<string, string>> = {}
  let heading: string | null = null
  let inFence = false

  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const headingMatch = /^##\s+(.+?)\s*$/.exec(line)
    if (headingMatch) {
      heading = headingMatch[1]
      continue
    }
    if (!heading || !line.trim().startsWith('|')) continue

    const cells = splitRow(line)
    if (cells.length !== 2 || isSeparatorRow(cells)) continue
    const [key, value] = cells
    if (key.toLowerCase() === 'key' && value.toLowerCase() === 'value') continue
    sections[heading] ??= {}
    sections[heading][key] = value
  }

  return sections
}

/** Strip code ticks and turn "not recorded yet…" into null. */
export function cleanValue(value: string | undefined): string | null {
  if (value === undefined) return null
  const trimmed = value.trim()
  if (!trimmed || NOT_RECORDED.test(trimmed)) return null
  return trimmed.replace(/`/g, '')
}

/** The first `owner/name` in backticks, or the cleaned value. */
function repoValue(value: string | undefined): string | null {
  if (!value) return null
  const ticked = /`([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)`/.exec(value)
  return ticked ? ticked[1] : cleanValue(value)
}

/** The first branch name in backticks, or the cleaned value. */
function branchValue(value: string | undefined): string | null {
  if (!value) return null
  const ticked = /`([^`]+)`/.exec(value)
  return ticked ? ticked[1] : cleanValue(value)
}

/** The first http(s) URL in the value, or null. */
function urlValue(value: string | undefined): string | null {
  const cleaned = cleanValue(value)
  if (!cleaned) return null
  const match = /https?:\/\/[^\s)>\]]+/.exec(cleaned)
  return match ? match[0].replace(/[.,;]+$/, '') : null
}

/** Every `@handle` in the value, without the `@`. */
export function parseHandles(value: string | undefined): string[] {
  if (!value || NOT_RECORDED.test(value.trim())) return []
  const handles: string[] = []
  for (const match of value.matchAll(/(?<![\w.])@([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))/g)) {
    if (!handles.includes(match[1])) handles.push(match[1])
  }
  return handles
}

function numberValue(value: string | undefined): number | null {
  const match = value ? /\d+/.exec(value) : null
  return match ? Number.parseInt(match[0], 10) : null
}

export function parseProfile(markdown: string): FactoryProfile {
  const sections = parseKeyValueSections(markdown)
  const repo = sections.Repo ?? {}
  const people = sections.People ?? {}

  return {
    repo: repoValue(repo.Repo),
    product: cleanValue(repo.Product),
    app: cleanValue(repo.App),
    integrationBranch: branchValue(repo['Integration branch']),
    productionBranch: branchValue(repo['Production branch']),
    stagingSite: urlValue(repo['Staging site']),
    people: {
      productOwners: parseHandles(people['Product owner']),
      qa: parseHandles(people.QA),
      developers: parseHandles(people.Developers),
      reviewAccounts: parseHandles(people['Review accounts']),
      umbrellaApprovals: numberValue(people['Umbrella approvals']),
    },
    sections,
  }
}
