import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('worker logger', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('loads in development mode', async () => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'development')

    await expect(import('./logger.js')).resolves.toHaveProperty('logger')
  })

  it('declares the development log transport dependency', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      devDependencies?: Record<string, string>
    }

    expect(manifest.devDependencies).toHaveProperty('pino-pretty')
  })
})
