import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..')

describe('chat route repository embedding profile usage', () => {
  it('uses repository index settings for retrieval instead of viewer embedding settings', () => {
    const source = readFileSync(join(repoRoot, 'apps/api/src/routes/chat.ts'), 'utf8')

    expect(source).toContain('getAiSettingsForRepo')
    expect(source).toContain('getRepositoryEmbeddingState')
    expect(source).toContain('getEmbeddingOptionsForProfile')
    expect(source).not.toContain('assertRepositoryEmbeddingCompatibility(repositoryId, aiSettings)')
  })

  it('returns wiki source file metadata without encoding it into source_files text', () => {
    const wikiSource = readFileSync(join(repoRoot, 'apps/api/src/routes/wiki.ts'), 'utf8')
    const querySource = readFileSync(join(repoRoot, 'packages/db/src/queries/index.ts'), 'utf8')

    expect(wikiSource).toContain('sourceFileMetadata')
    expect(querySource).toContain('getDocumentMetadataByPaths')
    expect(wikiSource).not.toContain('source_files:')
  })
})
