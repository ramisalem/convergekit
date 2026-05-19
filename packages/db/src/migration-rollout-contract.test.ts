import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('manual migration rollout contract', () => {
  it('preflights the production baseline before applying MCP token hardening', () => {
    const runner = readFileSync(join(packageRoot, 'src/apply-manual-migrations.ts'), 'utf8')

    expect(runner).toContain('verifyProductionMigrationBaseline')
    expect(runner).toContain('markVerifiedBaselineMigrations')
    expect(runner).toContain('CONVERGEKIT_LOCAL_BOOTSTRAP_MANUAL_MIGRATIONS')

    const preflightIndex = runner.indexOf('verifyProductionMigrationBaseline')
    const hardeningIndex = runner.indexOf('0015_mcp_token_hardening.sql')

    expect(preflightIndex).toBeGreaterThanOrEqual(0)
    expect(hardeningIndex).toBeGreaterThanOrEqual(0)
    expect(preflightIndex).toBeLessThan(hardeningIndex)
  })

  it('applies chat session history after token hardening', () => {
    const runner = readFileSync(join(packageRoot, 'src/apply-manual-migrations.ts'), 'utf8')

    const hardeningIndex = runner.indexOf('0015_mcp_token_hardening.sql')
    const chatHistoryIndex = runner.indexOf('0016_chat_session_history.sql')

    expect(hardeningIndex).toBeGreaterThanOrEqual(0)
    expect(chatHistoryIndex).toBeGreaterThanOrEqual(0)
    expect(hardeningIndex).toBeLessThan(chatHistoryIndex)
  })

  it('applies evidence metadata after chat session history', () => {
    const runner = readFileSync(join(packageRoot, 'src/apply-manual-migrations.ts'), 'utf8')
    const migration = readFileSync(join(packageRoot, 'migrations/0017_evidence_metadata.sql'), 'utf8')

    const chatHistoryIndex = runner.indexOf('0016_chat_session_history.sql')
    const evidenceIndex = runner.indexOf('0017_evidence_metadata.sql')

    expect(chatHistoryIndex).toBeGreaterThanOrEqual(0)
    expect(evidenceIndex).toBeGreaterThan(chatHistoryIndex)
    expect(migration).toContain('evidence_tier')
    expect(migration).toContain('indexed_commit_sha')
    expect(migration).toContain('"linked_code_content_hashes" jsonb')
  })

  it('keeps a dedicated operator command for checking migration readiness', () => {
    const packageJson = readFileSync(join(packageRoot, 'package.json'), 'utf8')

    expect(packageJson).toContain('"db:validate:baseline"')
    expect(packageJson).toContain('validate-migration-baseline.ts')
  })

  it('keeps an operator command for evidence metadata backfill', () => {
    const packageJson = readFileSync(join(packageRoot, 'package.json'), 'utf8')
    const backfillSource = readFileSync(join(packageRoot, 'src/backfill-evidence-metadata.ts'), 'utf8')

    expect(packageJson).toContain('"db:backfill:evidence"')
    expect(packageJson).toContain('backfill-evidence-metadata.ts')
    expect(backfillSource).toContain('classifyRepositoryFile')
    expect(backfillSource).toContain('extractLinkedCodePaths')
    expect(backfillSource).toContain("decision.evidenceTier === 'D'")
    expect(backfillSource).toContain('evidenceAlignmentStatus')
    expect(backfillSource).toContain('async function main()')
    expect(backfillSource).toContain('main()')
    expect(backfillSource).toContain('.catch')
    expect(backfillSource).toContain('.finally')
    expect(backfillSource).toContain('closeDbConnection')
  })

  it('keeps migration operations provider-neutral for open-source deployments', () => {
    const packageJson = readFileSync(join(packageRoot, 'package.json'), 'utf8')

    expect(packageJson).toContain('"db:migrate"')
    expect(packageJson).toContain('"db:validate:baseline"')
    expect(packageJson).toContain('"db:backfill:evidence"')
  })
})
