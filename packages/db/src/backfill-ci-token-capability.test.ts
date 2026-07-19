import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

// Mock ./client.js BEFORE anything imports the module under test, so importing
// the module never touches a real Postgres connection. vi.mock factories are
// hoisted above imports by vitest, and vi.hoisted lets the referenced spies be
// hoisted right along with it.
const { mockTransaction, mockCloseDbConnection } = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockCloseDbConnection: vi.fn(),
}))

vi.mock('./client.js', () => ({
  db: { transaction: mockTransaction },
  closeDbConnection: mockCloseDbConnection,
}))

const sourcePath = join(dirname(fileURLToPath(import.meta.url)), 'backfill-ci-token-capability.ts')
const source = readFileSync(sourcePath, 'utf8')

describe('decideGrant', () => {
  it("returns 'report' when reportOnly is true, regardless of count", async () => {
    const { decideGrant } = await import('./backfill-ci-token-capability.js')
    expect(decideGrant({ count: 15, expectedCount: 15, reportOnly: true })).toBe('report')
    expect(decideGrant({ count: 3, expectedCount: 15, reportOnly: true })).toBe('report')
  })

  it("returns 'abort' when count does not match expectedCount", async () => {
    const { decideGrant } = await import('./backfill-ci-token-capability.js')
    expect(decideGrant({ count: 14, expectedCount: 15, reportOnly: false })).toBe('abort')
    expect(decideGrant({ count: 16, expectedCount: 15, reportOnly: false })).toBe('abort')
  })

  it("returns 'grant' when count matches expectedCount and reportOnly is false", async () => {
    const { decideGrant } = await import('./backfill-ci-token-capability.js')
    expect(decideGrant({ count: 15, expectedCount: 15, reportOnly: false })).toBe('grant')
  })
})

describe('resolveBackfillOptions', () => {
  it('defaults to report-only when nothing is set', async () => {
    const { resolveBackfillOptions } = await import('./backfill-ci-token-capability.js')
    expect(resolveBackfillOptions([], {})).toEqual({
      reportOnly: true,
      expectedCount: 0,
      source: 'default',
    })
  })

  it('stays report-only when only an expected count is provided', async () => {
    const { resolveBackfillOptions } = await import('./backfill-ci-token-capability.js')
    expect(resolveBackfillOptions(['--expected-count=15'], {})).toEqual({
      reportOnly: true,
      expectedCount: 15,
      source: 'cli',
    })
    expect(resolveBackfillOptions([], { CI_TOKEN_BACKFILL_EXPECTED_COUNT: '15' })).toEqual({
      reportOnly: true,
      expectedCount: 15,
      source: 'env',
    })
  })

  it('stays report-only when report-only=false arrives without any count', async () => {
    const { resolveBackfillOptions } = await import('./backfill-ci-token-capability.js')
    expect(resolveBackfillOptions(['--report-only=false'], {})).toMatchObject({ reportOnly: true })
    expect(resolveBackfillOptions([], { CI_TOKEN_BACKFILL_REPORT_ONLY: 'false' })).toMatchObject({
      reportOnly: true,
    })
  })

  it('arms only when report-only is explicitly false AND a count is provided', async () => {
    const { resolveBackfillOptions } = await import('./backfill-ci-token-capability.js')
    expect(resolveBackfillOptions(['--report-only=false', '--expected-count=15'], {})).toEqual({
      reportOnly: false,
      expectedCount: 15,
      source: 'cli',
    })
    expect(
      resolveBackfillOptions([], {
        CI_TOKEN_BACKFILL_REPORT_ONLY: 'false',
        CI_TOKEN_BACKFILL_EXPECTED_COUNT: '15',
      }),
    ).toEqual({ reportOnly: false, expectedCount: 15, source: 'env' })
  })

  it('CLI wins over env for each option', async () => {
    const { resolveBackfillOptions } = await import('./backfill-ci-token-capability.js')
    // CLI --report-only overrides an env arming attempt.
    expect(
      resolveBackfillOptions(['--report-only'], {
        CI_TOKEN_BACKFILL_REPORT_ONLY: 'false',
        CI_TOKEN_BACKFILL_EXPECTED_COUNT: '15',
      }),
    ).toMatchObject({ reportOnly: true })
    // CLI count overrides env count (env supplies report-only=false).
    expect(
      resolveBackfillOptions(['--expected-count=15'], {
        CI_TOKEN_BACKFILL_REPORT_ONLY: 'false',
        CI_TOKEN_BACKFILL_EXPECTED_COUNT: '20',
      }),
    ).toEqual({ reportOnly: false, expectedCount: 15, source: 'cli' })
  })

  it("env report-only parsing: only the exact string 'false' reads as false", async () => {
    const { resolveBackfillOptions } = await import('./backfill-ci-token-capability.js')
    const count = { CI_TOKEN_BACKFILL_EXPECTED_COUNT: '15' }
    expect(
      resolveBackfillOptions([], { ...count, CI_TOKEN_BACKFILL_REPORT_ONLY: 'false' }),
    ).toMatchObject({ reportOnly: false })
    expect(
      resolveBackfillOptions([], { ...count, CI_TOKEN_BACKFILL_REPORT_ONLY: 'False' }),
    ).toMatchObject({ reportOnly: true })
    expect(
      resolveBackfillOptions([], { ...count, CI_TOKEN_BACKFILL_REPORT_ONLY: 'true' }),
    ).toMatchObject({ reportOnly: true })
  })

  it('malformed or empty expected count throws at parse time when arming', async () => {
    const { resolveBackfillOptions } = await import('./backfill-ci-token-capability.js')
    expect(() =>
      resolveBackfillOptions(['--report-only=false', '--expected-count=abc'], {}),
    ).toThrow(/integer/)
    expect(() =>
      resolveBackfillOptions(['--report-only=false', '--expected-count=15.5'], {}),
    ).toThrow(/integer/)
    expect(() => resolveBackfillOptions(['--report-only=false', '--expected-count='], {})).toThrow(
      /integer/,
    )
    // '' must never read as "provided with 0" — Number('') is 0.
    expect(() =>
      resolveBackfillOptions([], {
        CI_TOKEN_BACKFILL_REPORT_ONLY: 'false',
        CI_TOKEN_BACKFILL_EXPECTED_COUNT: '',
      }),
    ).toThrow(/integer/)
    // ...but a malformed count while report-only is inert (never compared).
    expect(resolveBackfillOptions(['--expected-count=abc'], {})).toMatchObject({
      reportOnly: true,
      expectedCount: 0,
    })
  })
})

describe('module shape', () => {
  it('exports runCiTokenCapabilityBackfill, decideGrant, buildCohortSelect, resolveBackfillOptions, and BackfillCountMismatchError', async () => {
    const mod = await import('./backfill-ci-token-capability.js')
    expect(typeof mod.runCiTokenCapabilityBackfill).toBe('function')
    expect(typeof mod.decideGrant).toBe('function')
    expect(typeof mod.buildCohortSelect).toBe('function')
    expect(typeof mod.resolveBackfillOptions).toBe('function')
    // Design decision: a count mismatch THROWS this error (so the caller's
    // transaction rolls back) instead of returning an 'aborted' outcome literal
    // a caller could inspect and choose to commit past anyway.
    expect(typeof mod.BackfillCountMismatchError).toBe('function')
    expect(new mod.BackfillCountMismatchError('boom')).toBeInstanceOf(Error)
  })
})

describe('import safety', () => {
  it('opens no transaction, logs nothing, and closes no connection on import', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Under vitest, process.argv[1] is the vitest binary, not this file, so the
    // direct-execution guard must evaluate false and main() must never run.
    await import('./backfill-ci-token-capability.js')

    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockCloseDbConnection).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()

    logSpy.mockRestore()
    errorSpy.mockRestore()
  })
})

describe('source pins', () => {
  it('locks, then rechecks the marker, before ever selecting or writing (exact ordering)', () => {
    const steps = [
      'LOCK TABLE "user" IN EXCLUSIVE MODE',
      'await hooks?.afterLock?.()',
      'SELECT 1 FROM "manual_migrations"',
      'const cohort = await buildCohortSelect(executor)',
      'CI token capability backfill cohort:',
      'const decision = decideGrant({',
      '.where(inArray(user.id, ids))',
      'if (updated.length !== cohort.length)',
      'INSERT INTO "manual_migrations"',
      'await hooks?.beforeCommit?.()',
      "return { outcome: 'granted', cohort }",
    ]

    const indexes = steps.map((needle) => source.indexOf(needle))
    for (const index of indexes) {
      expect(index).toBeGreaterThanOrEqual(0)
    }
    for (let i = 1; i < indexes.length; i++) {
      expect(indexes[i]).toBeGreaterThan(indexes[i - 1])
    }
  })

  it('documents the EXCLUSIVE (not SHARE ROW EXCLUSIVE) lock rationale', () => {
    expect(source).toContain('LOCK TABLE "user" IN EXCLUSIVE MODE')
    expect(source).toContain('SHARE ROW EXCLUSIVE')
    expect(source).toContain('ROW SHARE')
  })

  it('pins the backfill marker filename, distinct from the real 0024 migration file', () => {
    expect(source).toContain("'0024_ci_token_capability_backfill'")
  })

  it('pins the cohort predicate pieces, alias-qualified per the spec pseudocode', () => {
    expect(source).toContain('u.deactivated_at IS NULL')
    expect(source).toContain('t.repository_id IS NOT NULL')
    expect(source).toContain('t.last_used_at')
    expect(source).toContain("interval '30 days'")
    expect(source).toContain("t.revoked_at IS NULL OR t.revoked_reason = 'admin_token_migration'")
  })

  it('pins the CLI flags and their env fallbacks', () => {
    expect(source).toContain('--report-only')
    expect(source).toContain('--expected-count=')
    expect(source).toContain('CI_TOKEN_BACKFILL_REPORT_ONLY')
    expect(source).toContain('CI_TOKEN_BACKFILL_EXPECTED_COUNT')
  })

  it('pins the direct-execution guard', () => {
    expect(source).toContain('pathToFileURL(process.argv[1]).href')
  })

  it('pins the pre-lock fast-path in main(), before the transaction ever opens', () => {
    const fastPathIndex = source.indexOf('skipping (fast-path)')
    const transactionIndex = source.indexOf('await db.transaction(')
    expect(fastPathIndex).toBeGreaterThanOrEqual(0)
    expect(transactionIndex).toBeGreaterThanOrEqual(0)
    expect(fastPathIndex).toBeLessThan(transactionIndex)
    // The fast-path is a cheap early-out only — the under-lock re-check inside
    // the core function stays the authoritative guard.
    expect(source).toContain('NOT authoritative')
  })

  it('defaults to report-only', () => {
    expect(source).toContain('Default is report-only')
  })
})
