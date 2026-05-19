import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function readSource(pathFromPackageRoot: string) {
  // Source-grep contract tests may run from the package root or repo root.
  const candidates = [
    join(process.cwd(), pathFromPackageRoot),
    join(process.cwd(), 'apps/web', pathFromPackageRoot),
  ]
  const sourcePath = candidates.find((candidate) => existsSync(candidate))
  if (!sourcePath) throw new Error(`Unable to find source file: ${pathFromPackageRoot}`)
  return readFileSync(sourcePath, 'utf8')
}
