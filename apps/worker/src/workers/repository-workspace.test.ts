import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('repository worker workspace handling', () => {
  it('cleans stale repository workspaces before cloning and after processing', () => {
    const source = readFileSync(join(process.cwd(), 'src/workers/repository.ts'), 'utf8')
    const cloneIndex = source.indexOf('await git.clone(cloneUrl, workDir')
    const cleanupCalls = [...source.matchAll(/await cleanupWorkspace\(workDir\)/g)].map(
      (match) => match.index ?? -1,
    )

    expect(cloneIndex).toBeGreaterThanOrEqual(0)
    expect(cleanupCalls.length).toBeGreaterThanOrEqual(2)
    expect(cleanupCalls[0]).toBeLessThan(cloneIndex)
    expect(cleanupCalls.at(-1)).toBeGreaterThan(cloneIndex)
  })
})
