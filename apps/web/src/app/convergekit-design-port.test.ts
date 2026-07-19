import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourcePath(pathFromPackageRoot: string) {
  const candidates = [
    join(process.cwd(), pathFromPackageRoot),
    join(process.cwd(), 'apps/web', pathFromPackageRoot),
  ]
  return candidates.find((candidate) => existsSync(candidate))
}

function readSource(pathFromPackageRoot: string) {
  const path = sourcePath(pathFromPackageRoot)
  expect(path, `Expected ${pathFromPackageRoot} to exist`).toBeTruthy()
  return readFileSync(path!, 'utf8')
}

describe('ConvergeKit ConvergeKit design port', () => {
  it('uses the ConvergeKit app shell, design tokens, and dense workspace surfaces', () => {
    expect(sourcePath('src/components/convergekit-logo.tsx')).toBeTruthy()
    expect(readSource('src/components/app-shell.tsx')).toContain('ConvergeKitLogo')
    expect(readSource('src/app/[locale]/layout.tsx')).toContain('<AppShell>{children}</AppShell>')

    const globals = readSource('src/app/globals.css')
    expect(globals).toContain('--convergekit-bg: #ffffff')
    expect(globals).toContain('background-color: var(--convergekit-bg-2)')

    const repositoriesPage = readSource('src/app/[locale]/repositories/page.tsx')
    expect(repositoriesPage).toContain('grid-cols-[28px_minmax(0,1.5fr)_minmax(0,1fr)_auto_auto]')
    expect(repositoriesPage).toContain('Search repositories')
    expect(repositoriesPage).toContain('All statuses')

    expect(readSource('src/components/repository-detail/docs-tab.tsx')).toContain(
      'DocumentFileTree',
    )
    expect(readSource('src/components/repository-detail/chat-tab.tsx')).toContain(
      'ChatActivityRail',
    )
  })
})
