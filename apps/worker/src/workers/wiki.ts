import { eq } from 'drizzle-orm'
import { type Job, Worker } from 'bullmq'
import { generateText } from 'ai'
import {
  db,
  branches,
  getDocumentByPath,
  getDocumentPaths,
  updateWikiPage,
  upsertWikiPages,
  searchChunks,
  type NewWikiPage,
} from '@convergekit/db'
import { getModel, type ModelOptions } from '@convergekit/ai'
import { type WikiGenerationJobData, QUEUE_NAMES, WORKER_CONFIG, redis } from '@convergekit/queues'
import { updateRepositoryStatus } from '@convergekit/db'
import {
  assertBranchEmbeddingCompatibility,
  getEmbeddingOptionsFromModelOptions,
  getModelOptionsForRepo,
} from '../lib/ai.js'
import { linkRelatedPages, type RelatedPageLink } from '../lib/wiki-related-pages.js'
import { sanitizeGeneratedWikiContent } from '../lib/wiki-markdown.js'
import { logger } from '../logger.js'

const MINDMAP_PATH = '__mindmap__'

// ─── TOC structure returned by Haiku ─────────────────────────────────────────

interface TocPage {
  slug: string
  title: string
  orderIndex: number
  summary: string
}

interface TocSection {
  slug: string
  title: string
  orderIndex: number
  summary: string
  pages: TocPage[]
}

interface TocResult {
  sections: TocSection[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatContextBlock(
  chunks: Array<{ path: string; startLine: number; endLine: number; chunkType: string; content: string }>,
): string {
  return chunks
    .map((c) => `### ${c.path}:${c.startLine}-${c.endLine} (${c.chunkType})\n\`\`\`\n${c.content}\n\`\`\``)
    .join('\n\n')
}

function dedupeChunks<T extends { chunkId: string; score: number }>(arrays: T[][]): T[] {
  const seen = new Map<string, T>()
  for (const arr of arrays) {
    for (const item of arr) {
      const existing = seen.get(item.chunkId)
      if (!existing || item.score > existing.score) {
        seen.set(item.chunkId, item)
      }
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.score - a.score)
}

// ─── Step 2: Generate TOC via Haiku ──────────────────────────────────────────

async function generateToc(repositoryId: string, mindmapJson: string, fileTree: string, modelOptions?: ModelOptions): Promise<TocResult> {
  const system = `You are a technical documentation architect. Given a repository mind map and file tree, produce a structured wiki table-of-contents as JSON.

Rules:
- 6 to 12 top-level sections, each with 2 to 5 child pages
- Sections should cover relevant topics from: overview, architecture, subsystems, APIs, data models, configuration, testing, deployment, contributing
- Each slug must be lowercase, hyphen-separated, and globally unique across all sections and pages
- Titles must be Title Case and human-readable
- Summaries must be a single sentence (≤20 words)

Output ONLY valid JSON with no markdown fences, matching this exact schema:
{ "sections": [{ "slug": "string", "title": "string", "orderIndex": 0, "summary": "string", "pages": [{ "slug": "string", "title": "string", "orderIndex": 0, "summary": "string" }] }] }`

  const prompt = `Repository ID: ${repositoryId}

Mind map:
${mindmapJson}

File tree (first 200 lines):
${fileTree}`

  const { text, reasoningText } = await generateText({
    model: getModel('mindmap', modelOptions),
    system,
    prompt,
    // qwen3.5-9b (thinking model) uses 1000-3000 tokens on internal reasoning
    // before producing output — budget must cover reasoning + JSON
    maxOutputTokens: 8192,
    temperature: 0,
  })

  // Thinking models may return content in `reasoning` when `text` is empty
  const rawToc = text || reasoningText || ''
  if (!rawToc) throw new Error('TOC generation returned empty response — check model is loaded')

  const stripFences = (s: string) =>
    s.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim()

  try {
    return JSON.parse(stripFences(rawToc)) as TocResult
  } catch {
    // Retry once asking the model to fix the malformed JSON
    const { text: fixed, reasoningText: fixedReasoningText } = await generateText({
      model: getModel('mindmap', modelOptions),
      system: 'Fix the following invalid JSON and return only valid JSON, no markdown fences.',
      prompt: rawToc,
      maxOutputTokens: 8192,
      temperature: 0,
    })
    const fixedRaw = fixed || fixedReasoningText || ''
    if (!fixedRaw) throw new Error('TOC fix retry returned empty response')
    return JSON.parse(stripFences(fixedRaw)) as TocResult
  }
}

// ─── Step 4: Gather RAG context + generate page markdown via Sonnet ───────────

async function generatePageContent(
  repositoryId: string,
  page: { title: string; summary: string },
  mindmapContext: string,
  relatedPageTitles: string[],
  modelOptions?: ModelOptions,
): Promise<{ content: string; sourceFiles: string[] }> {
  const embeddingOptions = getEmbeddingOptionsFromModelOptions(modelOptions)

  // 3 parallel searches: title, summary, title+class chunks
  const [byTitle, bySummary, byClass] = await Promise.all([
    searchChunks(repositoryId, page.title, { limit: 8, embeddingOptions }),
    searchChunks(repositoryId, page.summary, { limit: 8, embeddingOptions }),
    searchChunks(repositoryId, page.title, { limit: 6, chunkType: 'class', embeddingOptions }),
  ])

  const top15 = dedupeChunks([byTitle, bySummary, byClass]).slice(0, 15)
  const contextBlock = formatContextBlock(top15)
  const sourceFiles = [...new Set(top15.map((c) => c.path))]

  const system = `You are a senior software engineer writing comprehensive wiki documentation for a software repository. Write clear, accurate, and technically precise markdown.

Formatting rules:
- Start with a single H1 heading matching the page title exactly
- Use H2 for major subsections, H3 for details
- The first visible output MUST be a collapsible source files block: <details><summary>Relevant source files</summary> followed by a list of all source files provided in context, then </details>
- Include 2–3 Mermaid diagrams (inside \`\`\`mermaid fences) where they meaningfully illustrate architecture, data flow, or relationships. Prefer vertical (TB) orientation.
- Use markdown tables for APIs, configurations, component mappings, and comparisons. Include columns like Component, File Location, and Role where applicable.
- CRITICAL: Every technical claim, table entry, and diagram MUST include a citation using the exact format [filename.ext:startLine-endLine](). Base citations ONLY on the source chunks provided in context. Example: [src/auth/handler.ts:15-42]()
- Add a "Sources:" line immediately after every Mermaid diagram and every markdown table.
- Return raw markdown only. Never wrap the entire page in \`\`\` or \`\`\`markdown fences.
- Do NOT invent API shapes or behavior not evidenced in the context
- Length: 800–1500 words of prose (excluding code blocks and diagrams)
- End with a ## Related Pages section listing 2–4 titles copied exactly from the available wiki page titles`

  const prompt = `Write the wiki page titled "${page.title}".

Context from the codebase:
${contextBlock || '(No indexed chunks found — use the mind map context below)'}

Relevant context from the repository mind map:
${mindmapContext}

Available wiki page titles:
${relatedPageTitles.filter((title) => title !== page.title).map((title) => `- ${title}`).join('\n')}`

  const { text, reasoningText } = await generateText({
    model: getModel('mindmap', modelOptions),
    system,
    prompt,
    maxOutputTokens: 8192,
    temperature: 0,
  })

  return { content: text || reasoningText || '', sourceFiles }
}

// ─── Main job processor ───────────────────────────────────────────────────────

async function processWikiGeneration(job: Job<WikiGenerationJobData>): Promise<void> {
  const { repositoryId, branchId, commitSha } = job.data

  // ── Resolve per-user model options ────────────────────────────────────────
  const modelOptions: ModelOptions | undefined = await getModelOptionsForRepo(repositoryId)
  const embeddingOptions = getEmbeddingOptionsFromModelOptions(modelOptions)
  const [branch] = await db
    .select()
    .from(branches)
    .where(eq(branches.id, branchId))
    .limit(1)
  if (!branch) throw new Error(`Branch ${branchId} not found`)
  assertBranchEmbeddingCompatibility(branch, embeddingOptions)

  // ── Step 1: Load mindmap + file tree ──────────────────────────────────────
  const mindmapDoc = await getDocumentByPath(repositoryId, MINDMAP_PATH)
  if (!mindmapDoc) throw new Error(`Mindmap not found for repo ${repositoryId} — ensure mindmap job ran first`)

  const filePaths = await getDocumentPaths(repositoryId)
  const fileTree = filePaths
    .filter((d) => d.path !== MINDMAP_PATH)
    .map((d) => d.path)
    .slice(0, 200)
    .join('\n')

  await job.updateProgress(10)

  // ── Step 2: Generate TOC via Haiku ────────────────────────────────────────
  const toc = await generateToc(repositoryId, mindmapDoc.content, fileTree, modelOptions)
  logger.info({ repositoryId, sections: toc.sections.length }, 'Wiki TOC generated')

  await job.updateProgress(20)

  // ── Step 3: Upsert all pages as pending ───────────────────────────────────
  const pagesToInsert: NewWikiPage[] = []
  let globalOrder = 0

  for (const section of toc.sections) {
    pagesToInsert.push({
      repositoryId,
      branchId,
      slug: section.slug,
      title: section.title,
      parentSlug: null,
      orderIndex: globalOrder++,
      summary: section.summary,
      status: 'pending',
      content: '',
    })
    for (const page of section.pages) {
      pagesToInsert.push({
        repositoryId,
        branchId,
        slug: page.slug,
        title: page.title,
        parentSlug: section.slug,
        orderIndex: globalOrder++,
        summary: page.summary,
        status: 'pending',
        content: '',
      })
    }
  }

  const insertedPages = await upsertWikiPages(pagesToInsert)
  logger.info({ repositoryId, total: insertedPages.length }, 'Wiki pages upserted as pending')

  // Related links should only target generated child pages. Section headers are
  // navigation placeholders, so linking to them produces non-readable pages.
  const childRelatedPages = toc.sections.flatMap((section) =>
    section.pages.map((page) => ({ title: page.title, slug: page.slug })),
  )
  const relatedPages: RelatedPageLink[] = toc.sections.flatMap((section) => [
    ...(section.pages[0] ? [{ title: section.title, slug: section.pages[0].slug }] : []),
    ...section.pages.map((page) => ({ title: page.title, slug: page.slug })),
  ])

  await job.updateProgress(25)

  // ── Step 4: Generate content for each page ────────────────────────────────
  // Only generate content for child pages (parentSlug !== null); section headers
  // are navigation-only placeholders with no content.
  const contentPages = insertedPages.filter((p) => p.parentSlug !== null)
  const total = contentPages.length
  let succeeded = 0

  for (let i = 0; i < contentPages.length; i++) {
    const page = contentPages[i]
    try {
      const { content: rawContent, sourceFiles } = await generatePageContent(
        repositoryId,
        { title: page.title, summary: page.summary ?? page.title },
        mindmapDoc.content,
        childRelatedPages.map((relatedPage) => relatedPage.title),
        modelOptions,
      )
      const sanitizedContent = sanitizeGeneratedWikiContent(rawContent)
      const content = linkRelatedPages(sanitizedContent, relatedPages)
      if (!content.startsWith('<details>')) {
        logger.warn({ repositoryId, slug: page.slug }, 'Generated wiki page is missing the leading source files block')
      }
      if (!/\[[^\]]+:\d+(?:-\d+)?\]\(\)/.test(content)) {
        logger.warn({ repositoryId, slug: page.slug }, 'Generated wiki page has no line-aware citations after cleanup')
      }
      await updateWikiPage(page.id, {
        content,
        sourceFiles,
        status: 'done',
        generatedAt: new Date(),
        commitSha: commitSha ?? null,
      })
      succeeded++
    } catch (err) {
      logger.error({ repositoryId, slug: page.slug, err }, 'Failed to generate wiki page')
      await updateWikiPage(page.id, { status: 'failed' })
    }

    await job.updateProgress(25 + Math.round(((i + 1) / total) * 70))
  }

  if (succeeded === 0 && total > 0) {
    throw new Error(`All ${total} wiki pages failed to generate`)
  }

  // Mark section header pages as done too (they have no content to generate)
  const sectionPages = insertedPages.filter((p) => p.parentSlug === null)
  await Promise.all(
    sectionPages.map((p) =>
      updateWikiPage(p.id, { status: 'done', generatedAt: new Date(), commitSha: commitSha ?? null }),
    ),
  )

  await job.updateProgress(100)
  await updateRepositoryStatus(repositoryId, 'done')
  logger.info({ repositoryId, succeeded, total }, 'Wiki generation complete')
}

// ─── Worker factory ───────────────────────────────────────────────────────────

export function createWikiWorker(): Worker<WikiGenerationJobData> {
  const config = WORKER_CONFIG[QUEUE_NAMES.WIKI_GENERATION]

  const worker = new Worker<WikiGenerationJobData>(
    QUEUE_NAMES.WIKI_GENERATION,
    processWikiGeneration,
    {
      connection: redis,
      concurrency: config.concurrency,
      limiter: config.limiter,
    },
  )

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, repositoryId: job?.data.repositoryId, err }, 'Wiki generation job failed')
  })

  return worker
}
