import { readdir, readFile, rm, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import {
  SUPPORTED_EXTENSIONS,
  classifyRepositoryFile,
  getMaxIndexFileBytes,
  shouldSkipRepositoryDirectory,
  type IndexableFileDecision,
  type SkippedRepositoryFile,
} from './indexing-limits.js'

export { SUPPORTED_EXTENSIONS }

export type RepositoryFile = {
  absolutePath: string
  path: string
  sizeBytes: number
  decision: Extract<IndexableFileDecision, { index: true }>
}

export type WalkRepositoryResult = {
  files: RepositoryFile[]
  skipped: SkippedRepositoryFile[]
}

export async function walkRepositoryFiles(
  rootDir: string,
  options: { maxFileBytes?: number } = {},
): Promise<WalkRepositoryResult> {
  const files: RepositoryFile[] = []
  const skipped: SkippedRepositoryFile[] = []
  const maxFileBytes = options.maxFileBytes ?? getMaxIndexFileBytes()

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    await Promise.all(
      entries.map(async (entry) => {
        if (entry.isDirectory()) {
          const absolutePath = join(dir, entry.name)
          const path = relativePath(rootDir, absolutePath)
          if (!shouldSkipRepositoryDirectory(path)) {
            await walk(absolutePath)
          }
        } else if (entry.isFile()) {
          const absolutePath = join(dir, entry.name)
          const path = relativePath(rootDir, absolutePath)
          const sizeBytes = await getFileSizeBytes(absolutePath)
          const decision = classifyRepositoryFile(path, sizeBytes, { maxFileBytes })

          if (decision.index) {
            files.push({ absolutePath, path, sizeBytes, decision })
          } else if (decision.reason !== 'unsupported-extension') {
            skipped.push({
              path,
              sizeBytes,
              reason: decision.reason,
              detail: decision.detail,
            })
          }
        }
      }),
    )
  }

  await walk(rootDir)
  return { files, skipped }
}

export async function walkRepository(rootDir: string): Promise<string[]> {
  const { files } = await walkRepositoryFiles(rootDir)
  return files.map((file) => file.absolutePath)
}

export async function readFileContent(filePath: string): Promise<string> {
  const content = await readFile(filePath, 'utf-8')
  return content
}

export function relativePath(rootDir: string, filePath: string): string {
  return relative(rootDir, filePath)
}

export async function getFileSizeBytes(filePath: string): Promise<number> {
  const s = await stat(filePath)
  return s.size
}

export async function cleanupWorkspace(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
}
