import { Hono } from 'hono'
import { z } from 'zod'
import { getDocumentByPath, getDocumentPaths } from '@convergekit/db'
import { assertRepoAccess } from '../lib/scoping.js'

export const documentRoutes = new Hono()

const querySchema = z.object({
  repositoryId: z.string().uuid(),
  path: z.string().optional(),
})

/**
 * GET /api/documents?repositoryId=<uuid>&path=<prefix>
 * List document paths (and optionally filter by path prefix) for a repository.
 */
documentRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const { repositoryId, path } = querySchema.parse(c.req.query())
  await assertRepoAccess(userId, repositoryId)
  const docs = await getDocumentPaths(repositoryId, path)
  return c.json({ documents: docs })
})

/**
 * GET /api/documents/content?repositoryId=<uuid>&path=<exact-path>
 * Fetch the full content of a single document.
 */
documentRoutes.get('/content', async (c) => {
  const userId = c.get('userId')
  const { repositoryId, path } = querySchema
    .required({ path: true })
    .parse(c.req.query())
  await assertRepoAccess(userId, repositoryId)
  const doc = await getDocumentByPath(repositoryId, path)
  if (!doc) return c.json({ error: 'Document not found' }, 404)
  return c.json({ document: doc })
})
