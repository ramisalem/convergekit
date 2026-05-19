import { Hono } from 'hono'
import { z } from 'zod'
import { getDocumentMetadataByPaths, getWikiPages, getWikiPageBySlug } from '@convergekit/db'
import { assertRepoAccess } from '../lib/scoping.js'

export const wikiRoutes = new Hono()

// ─── GET /api/wiki/:repositoryId/pages ───────────────────────────────────────
// Returns the full hierarchical TOC for a repository's wiki.

const repoParamSchema = z.object({ repositoryId: z.string().uuid() })

wikiRoutes.get('/:repositoryId/pages', async (c) => {
  const userId = c.get('userId')
  const { repositoryId } = repoParamSchema.parse(c.req.param())
  await assertRepoAccess(userId, repositoryId)

  const rows = await getWikiPages(repositoryId)

  // Group into hierarchical structure
  const sectionsMap = new Map<string, {
    slug: string; title: string; orderIndex: number; summary: string | null; status: string;
    generatedAt: string | null; pages: typeof rows;
  }>()

  for (const row of rows) {
    if (row.parentSlug === null) {
      sectionsMap.set(row.slug, {
        slug: row.slug,
        title: row.title,
        orderIndex: row.orderIndex,
        summary: row.summary,
        status: row.status,
        generatedAt: row.generatedAt?.toISOString() ?? null,
        pages: [],
      })
    }
  }
  for (const row of rows) {
    if (row.parentSlug !== null) {
      const section = sectionsMap.get(row.parentSlug)
      if (section) section.pages.push(row)
    }
  }

  const sections = Array.from(sectionsMap.values())
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((s) => ({
      slug: s.slug,
      title: s.title,
      orderIndex: s.orderIndex,
      summary: s.summary,
      status: s.status,
      generatedAt: s.generatedAt,
      pages: s.pages
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((p) => ({
          slug: p.slug,
          title: p.title,
          orderIndex: p.orderIndex,
          summary: p.summary,
          status: p.status,
          generatedAt: p.generatedAt?.toISOString() ?? null,
        })),
    }))

  const lastGeneratedAt =
    rows
      .map((r) => r.generatedAt)
      .filter(Boolean)
      .sort((a, b) => (b?.getTime() ?? 0) - (a?.getTime() ?? 0))[0]
      ?.toISOString() ?? null

  const commitSha = rows.find((r) => r.commitSha)?.commitSha ?? null

  return c.json({ repositoryId, lastGeneratedAt, commitSha, sections })
})

// ─── GET /api/wiki/:repositoryId/pages/:slug ─────────────────────────────────
// Returns a single wiki page's full content.

const pageParamSchema = z.object({ repositoryId: z.string().uuid(), slug: z.string().min(1) })

wikiRoutes.get('/:repositoryId/pages/:slug', async (c) => {
  const userId = c.get('userId')
  const { repositoryId, slug } = pageParamSchema.parse(c.req.param())
  await assertRepoAccess(userId, repositoryId)

  const page = await getWikiPageBySlug(repositoryId, slug)
  if (!page) return c.json({ error: 'Page not found' }, 404)

  // Return 202 if still generating so the frontend can poll
  if (page.status === 'pending' || page.status === 'generating') {
    return c.json({ status: page.status }, 202)
  }

  const sourceFiles = page.sourceFiles ?? []
  const sourceFileMetadata = await getDocumentMetadataByPaths(repositoryId, sourceFiles)

  return c.json({
    page: {
      slug: page.slug,
      title: page.title,
      parentSlug: page.parentSlug,
      content: page.content,
      summary: page.summary,
      status: page.status,
      generatedAt: page.generatedAt?.toISOString() ?? null,
      commitSha: page.commitSha,
      orderIndex: page.orderIndex,
      sourceFiles: page.sourceFiles,
      sourceFileMetadata,
    },
  })
})
