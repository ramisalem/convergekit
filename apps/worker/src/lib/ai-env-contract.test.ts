import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function localWorkerServiceBlock(): string {
  const source = readFileSync(join(process.cwd(), '../../compose.local.yaml'), 'utf8')
  const start = source.indexOf('\n  worker:\n')
  const end = source.indexOf('\nvolumes:\n', start)

  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)

  return source.slice(start, end)
}

describe('worker AI settings environment', () => {
  it('passes the API key encryption secret to the local worker service', () => {
    expect(localWorkerServiceBlock()).toContain('BETTER_AUTH_SECRET:')
  })
})
