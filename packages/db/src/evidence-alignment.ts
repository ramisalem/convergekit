import { createHash } from 'node:crypto'
import type { EvidenceAlignmentStatus } from './evidence.js'

const BACKTICK_PATH_RE =
  /`([^`\n]+?\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|sql|json|ya?ml|toml|mdx?))`/g

function extractFrontmatter(content: string): string | null {
  return content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? null
}

export function extractLinkedCodePaths(content: string): string[] {
  const paths = new Set<string>()
  const frontmatter = extractFrontmatter(content)
  if (frontmatter) {
    const lines = frontmatter.split('\n')
    let inLinkedPaths = false
    for (const line of lines) {
      if (/^\s*linked_code_paths:\s*$/.test(line)) {
        inLinkedPaths = true
        continue
      }
      if (inLinkedPaths && /^\s*-\s+/.test(line)) {
        paths.add(line.replace(/^\s*-\s+/, '').trim())
        continue
      }
      if (inLinkedPaths && /^\S/.test(line)) inLinkedPaths = false
    }
  }

  for (const match of content.matchAll(BACKTICK_PATH_RE)) {
    paths.add(match[1])
  }

  return [...paths].sort()
}

export function extractEvidenceVerificationMetadata(content: string): {
  verifiedAgainstCommitSha: string | null
  lastVerifiedAgainstCodeAt: Date | null
} {
  const frontmatter = extractFrontmatter(content)
  if (!frontmatter) {
    return { verifiedAgainstCommitSha: null, lastVerifiedAgainstCodeAt: null }
  }

  const verifiedAgainstCommitSha =
    frontmatter
      .match(/^\s*verified_against_commit_sha:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]
      ?.trim() ?? null
  const lastVerifiedRaw =
    frontmatter
      .match(/^\s*last_verified_against_code_at:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]
      ?.trim() ?? null
  const lastVerifiedAgainstCodeAt = lastVerifiedRaw ? new Date(lastVerifiedRaw) : null

  return {
    verifiedAgainstCommitSha,
    lastVerifiedAgainstCodeAt:
      lastVerifiedAgainstCodeAt && !Number.isNaN(lastVerifiedAgainstCodeAt.getTime())
        ? lastVerifiedAgainstCodeAt
        : null,
  }
}

export function sha256Content(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export function computeLinkedCodeContentHashes(
  linkedCodePaths: string[],
  contentByPath: Map<string, string>,
): Record<string, string> {
  const hashes: Record<string, string> = {}
  for (const path of linkedCodePaths) {
    const content = contentByPath.get(path)
    if (content !== undefined) hashes[path] = sha256Content(content)
  }
  return hashes
}

export function deriveEvidenceAlignmentStatus(input: {
  linkedCodePaths: string[]
  indexedCommitSha: string | null
  verifiedAgainstCommitSha: string | null
  linkedCodeContentHashes: Record<string, string>
  currentLinkedCodeContentHashes: Record<string, string>
}): EvidenceAlignmentStatus {
  if (input.linkedCodePaths.length === 0) return 'unverified'
  if (!input.verifiedAgainstCommitSha) return 'unverified'
  if (input.verifiedAgainstCommitSha && input.verifiedAgainstCommitSha === input.indexedCommitSha) {
    return 'aligned'
  }
  if (input.linkedCodePaths.some((path) => !input.linkedCodeContentHashes[path])) {
    return 'unverified'
  }
  for (const path of input.linkedCodePaths) {
    const expected = input.linkedCodeContentHashes[path]
    const current = input.currentLinkedCodeContentHashes[path]
    if (!expected || !current || expected !== current) return 'stale'
  }
  return 'aligned'
}
