import { describe, expect, it } from 'vitest'
import {
  computeLinkedCodeContentHashes,
  deriveEvidenceAlignmentStatus,
  extractEvidenceVerificationMetadata,
  extractLinkedCodePaths,
} from './evidence-alignment.js'

describe('extractLinkedCodePaths', () => {
  it('extracts explicit frontmatter paths', () => {
    expect(
      extractLinkedCodePaths(`---
evidence:
  linked_code_paths:
    - apps/api/src/routes/chat.ts
    - apps/api/src/lib/agent-tools.ts
---
# Design
`),
    ).toEqual(['apps/api/src/lib/agent-tools.ts', 'apps/api/src/routes/chat.ts'])
  })

  it('extracts only backtick-quoted inline repository paths as a fallback', () => {
    expect(
      extractLinkedCodePaths('Implemented in `src/routes/login.ts` and src/models/user.ts.'),
    ).toEqual(['src/routes/login.ts'])
  })

  it('returns paths in deterministic sorted order', () => {
    expect(
      extractLinkedCodePaths(
        'Compare `src/zeta.ts` with `src/alpha.ts` and `src/zeta.ts` for the decision.',
      ),
    ).toEqual(['src/alpha.ts', 'src/zeta.ts'])
  })
})

describe('extractEvidenceVerificationMetadata', () => {
  it('extracts explicit frontmatter verification metadata', () => {
    expect(
      extractEvidenceVerificationMetadata(`---
evidence:
  verified_against_commit_sha: abc123
  last_verified_against_code_at: 2026-05-06T12:00:00.000Z
---
# Design
`),
    ).toEqual({
      verifiedAgainstCommitSha: 'abc123',
      lastVerifiedAgainstCodeAt: new Date('2026-05-06T12:00:00.000Z'),
    })
  })
})

describe('computeLinkedCodeContentHashes', () => {
  it('hashes only linked paths that exist in the content map', () => {
    const hashes = computeLinkedCodeContentHashes(
      ['src/a.ts', 'src/missing.ts'],
      new Map([['src/a.ts', 'export const a = 1']]),
    )

    expect(Object.keys(hashes)).toEqual(['src/a.ts'])
    expect(hashes['src/a.ts']).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('deriveEvidenceAlignmentStatus', () => {
  it('marks docs without links as unverified', () => {
    expect(
      deriveEvidenceAlignmentStatus({
        linkedCodePaths: [],
        indexedCommitSha: 'abc',
        verifiedAgainstCommitSha: 'abc',
        linkedCodeContentHashes: {},
        currentLinkedCodeContentHashes: {},
      }),
    ).toBe('unverified')
  })

  it('marks matching commit as aligned', () => {
    expect(
      deriveEvidenceAlignmentStatus({
        linkedCodePaths: ['src/a.ts'],
        indexedCommitSha: 'abc',
        verifiedAgainstCommitSha: 'abc',
        linkedCodeContentHashes: {},
        currentLinkedCodeContentHashes: {},
      }),
    ).toBe('aligned')
  })

  it('marks changed linked content as stale', () => {
    expect(
      deriveEvidenceAlignmentStatus({
        linkedCodePaths: ['src/a.ts'],
        indexedCommitSha: 'new',
        verifiedAgainstCommitSha: 'old',
        linkedCodeContentHashes: { 'src/a.ts': 'oldhash' },
        currentLinkedCodeContentHashes: { 'src/a.ts': 'newhash' },
      }),
    ).toBe('stale')
  })

  it('keeps linked docs unverified when verification hashes have not been computed', () => {
    expect(
      deriveEvidenceAlignmentStatus({
        linkedCodePaths: ['src/a.ts'],
        indexedCommitSha: 'new',
        verifiedAgainstCommitSha: null,
        linkedCodeContentHashes: {},
        currentLinkedCodeContentHashes: {},
      }),
    ).toBe('unverified')
  })

  it('keeps linked docs unverified when paths and hashes were extracted but no verification commit is present', () => {
    expect(
      deriveEvidenceAlignmentStatus({
        linkedCodePaths: ['src/a.ts'],
        indexedCommitSha: 'abc',
        verifiedAgainstCommitSha: null,
        linkedCodeContentHashes: { 'src/a.ts': 'hash' },
        currentLinkedCodeContentHashes: { 'src/a.ts': 'hash' },
      }),
    ).toBe('unverified')
  })
})
