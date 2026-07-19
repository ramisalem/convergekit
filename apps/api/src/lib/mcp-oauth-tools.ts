import {
  getAiSettingsForRepo,
  getDocumentByPath,
  getDocumentPaths,
  getPrimaryLanguagesByIds,
  getRepositoriesMetaByIds,
  getRepositoryListingTopicsByIds,
  searchChunks,
} from '@convergekit/db'
import type { UserServerDeps } from '@convergekit/mcp'
import { logger } from '../logger.js'
import {
  getEmbeddingOptionsForProfile,
  getRepositoryEmbeddingState,
} from './embedding-compatibility.js'
import { scopedRepositoryIds } from './scoping.js'

const NOT_ACCESSIBLE = 'Repository not found or not accessible'

export function buildUserServerDeps(userId: string): UserServerDeps {
  async function accessibleIds(): Promise<Set<string>> {
    return scopedRepositoryIds(userId)
  }

  return {
    listRepositories: async () => {
      const ids = [...(await accessibleIds())]
      const [metas, languages, topics] = await Promise.all([
        getRepositoriesMetaByIds(ids),
        getPrimaryLanguagesByIds(ids),
        getRepositoryListingTopicsByIds(ids),
      ])
      return metas.map((meta) => {
        const repoTopics = topics.get(meta.id)
        return {
          id: meta.id,
          name: meta.name,
          defaultBranch: meta.defaultBranch,
          description: repoTopics?.description ?? null,
          topics: repoTopics?.topics ?? [],
          primaryLanguage: languages.get(meta.id) ?? null,
          lastIndexedAt: meta.lastIndexedAt,
          status: meta.status,
        }
      })
    },

    resolveRepository: async (ref: string) => {
      const allowed = await accessibleIds()
      if (allowed.has(ref)) return { ok: true, repositoryId: ref }
      // Exact-name match within the accessible set only (no existence leak).
      const metas = await getRepositoriesMetaByIds([...allowed])
      const byName = metas.filter((m) => m.name === ref)
      if (byName.length === 1) return { ok: true, repositoryId: byName[0].id }
      if (byName.length > 1) {
        return {
          ok: false,
          error: `Ambiguous repository name "${ref}". Use one of these ids: ${byName
            .map((m) => m.id)
            .join(', ')}`,
        }
      }
      return { ok: false, error: NOT_ACCESSIBLE }
    },

    searchDocs: async (repositoryId, query, limit) => {
      try {
        const aiSettings = await getAiSettingsForRepo(repositoryId)
        const state = await getRepositoryEmbeddingState(repositoryId, aiSettings)
        const embeddingOptions = getEmbeddingOptionsForProfile(aiSettings, state.storedProfile)
        const results = await searchChunks(repositoryId, query, { limit, embeddingOptions })
        return JSON.stringify(
          results.map((r) => ({
            path: r.path,
            startLine: r.startLine,
            endLine: r.endLine,
            chunkType: r.chunkType,
            content: r.content,
            score: r.score,
          })),
          null,
          2,
        )
      } catch (error) {
        logger.error(
          {
            repositoryId,
            query,
            limit,
            error:
              error instanceof Error ? { name: error.name, message: error.message } : String(error),
          },
          'mcp search_docs failed',
        )
        throw error
      }
    },

    getStructure: async (repositoryId, pathPrefix) => {
      const rows = await getDocumentPaths(repositoryId, pathPrefix)
      return JSON.stringify(
        rows.map((r) => ({ path: r.path, programmingLanguage: r.programmingLanguage ?? null })),
        null,
        2,
      )
    },

    readFile: async (repositoryId, path) => {
      const doc = await getDocumentByPath(repositoryId, path)
      return doc ? doc.content : `File not found: ${path}`
    },
  }
}
