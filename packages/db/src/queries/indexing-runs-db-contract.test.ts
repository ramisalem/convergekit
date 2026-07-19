import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('indexing-runs db query helpers', () => {
  const source = readFileSync(new URL('./indexing-runs.ts', import.meta.url), 'utf8')

  it('exposes run lifecycle helpers', () => {
    expect(source).toContain('export async function createIndexingRun')
    expect(source).toContain('export async function updateIndexingRun')
    expect(source).toContain('export async function getActiveIncrementalRun')
    expect(source).toContain('export async function listIndexingRuns')
    expect(source).toContain('export async function getIncrementalIndexingSummaries')
  })

  it('exposes branch pause helpers', () => {
    expect(source).toContain('export async function pauseBranchIncrementalIndexing')
    expect(source).toContain('export async function resumeBranchIncrementalIndexing')
  })

  it('only treats checking/queued/processing runs as active', () => {
    expect(source).toContain('ACTIVE_RUN_STATUSES')
    expect(source).toContain('inArray(indexingRuns.status, [...ACTIVE_RUN_STATUSES])')
  })

  it('reaps orphaned active runs past a max-age cutoff', () => {
    expect(source).toContain('export async function reapStaleIncrementalRuns')
    expect(source).toContain("failureCode: 'orphaned'")
    // only active runs, and only those older than the cutoff (computed by the DB
    // clock, not a JS Date param — which the driver rejects in a raw fragment)
    expect(source).toContain('inArray(indexingRuns.status, [...ACTIVE_RUN_STATUSES])')
    expect(source).toContain('< now() - ${maxAgeMs}')
  })

  it('is exported from the queries barrel', () => {
    const barrel = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
    expect(barrel).toContain("export * from './indexing-runs.js'")
  })
})
