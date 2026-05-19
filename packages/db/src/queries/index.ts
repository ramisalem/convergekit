import { and, asc, desc, eq, inArray, isNull, like, notInArray, sql } from 'drizzle-orm'
import { db } from '../client.js'
import {
  type NewChunk,
  type NewDocument,
  type NewWikiPage,
  type UserAiSettings,
  type WikiPage,
  branches,
  chatMessages,
  chatSessions,
  chunks,
  documents,
  repositories,
  userAiSettings,
  wikiPages,
} from '../schema.js'

const INTERNAL_DOCUMENT_PATHS = ['__mindmap__']

// ─── Repositories ─────────────────────────────────────────────────────────────

export function findRepositoryById(id: string, userId: string) {
  return db.query.repositories.findFirst({
    where: and(
      eq(repositories.id, id),
      eq(repositories.userId, userId),
      isNull(repositories.deletedAt),
    ),
    with: { branches: true },
  })
}

export async function updateRepositoryStatus(
  id: string,
  status: 'pending' | 'processing' | 'done' | 'failed',
) {
  const [updated] = await db
    .update(repositories)
    .set({ status, updatedAt: new Date() })
    .where(eq(repositories.id, id))
    .returning()
  return updated
}

// ─── Documents ────────────────────────────────────────────────────────────────

export async function upsertDocument(
  branchId: string,
  path: string,
  values: Omit<NewDocument, 'branchId' | 'path'>,
) {
  const [doc] = await db
    .insert(documents)
    .values({ branchId, path, ...values })
    .onConflictDoUpdate({
      target: [documents.branchId, documents.path],
      set: { ...values, updatedAt: new Date() },
    })
    .returning()
  return doc
}

// ─── Chunks ───────────────────────────────────────────────────────────────────

export async function upsertChunk(documentId: string, values: Omit<NewChunk, 'documentId'>) {
  const [chunk] = await db
    .insert(chunks)
    .values({ documentId, ...values })
    .onConflictDoUpdate({
      target: [chunks.documentId, chunks.startLine],
      set: { ...values, updatedAt: new Date() },
    })
    .returning()
  return chunk
}

export function findChunksByDocument(documentId: string) {
  return db.query.chunks.findMany({
    where: eq(chunks.documentId, documentId),
    orderBy: asc(chunks.startLine),
  })
}

// ─── Document lookups scoped to a repository ──────────────────────────────────

export async function getDocumentByPath(repositoryId: string, filePath: string) {
  const result = await db
    .select({
      id: documents.id,
      path: documents.path,
      content: documents.content,
      programmingLanguage: documents.programmingLanguage,
    })
    .from(documents)
    .innerJoin(branches, eq(documents.branchId, branches.id))
    .where(and(eq(branches.repositoryId, repositoryId), eq(documents.path, filePath)))
    .limit(1)
  return result[0] ?? null
}

export async function getDocumentPaths(repositoryId: string, pathPrefix?: string) {
  const conditions = [
    eq(branches.repositoryId, repositoryId),
    notInArray(documents.path, INTERNAL_DOCUMENT_PATHS),
  ]
  if (pathPrefix) conditions.push(like(documents.path, `${pathPrefix}%`))

  return db
    .select({
      path: documents.path,
      programmingLanguage: documents.programmingLanguage,
    })
    .from(documents)
    .innerJoin(branches, eq(documents.branchId, branches.id))
    .where(and(...conditions))
    .orderBy(asc(documents.path))
}

// ─── Branches ─────────────────────────────────────────────────────────────────

export async function markBranchIndexed(branchId: string, indexedCommitSha?: string | null) {
  const [updated] = await db
    .update(branches)
    .set({ lastIndexedAt: new Date(), indexedCommitSha: indexedCommitSha ?? null })
    .where(eq(branches.id, branchId))
    .returning()
  return updated
}

export async function updateBranchEmbeddingProfile(
  branchId: string,
  values: Pick<
    typeof branches.$inferInsert,
    | 'embeddingProvider'
    | 'embeddingModel'
    | 'embeddingDimensions'
    | 'embeddingEndpoint'
    | 'embeddingProfileCapturedAt'
  >,
) {
  const [updated] = await db
    .update(branches)
    .set(values)
    .where(eq(branches.id, branchId))
    .returning()
  return updated
}

export async function resetBranchIndexState(branchId: string) {
  const [updated] = await db
    .update(branches)
    .set({
      lastIndexedAt: null,
      embeddingProvider: null,
      embeddingModel: null,
      embeddingDimensions: null,
      embeddingEndpoint: null,
      embeddingProfileCapturedAt: null,
      indexedCommitSha: null,
    })
    .where(eq(branches.id, branchId))
    .returning()
  return updated
}

export function getBranchByRepositoryId(repositoryId: string) {
  return db.query.branches.findFirst({
    where: eq(branches.repositoryId, repositoryId),
  })
}

// ─── Chat ──────────────────────────────────────────────────────────────────────

export const CHAT_MODEL_HISTORY_LIMIT = 20
export const CHAT_SESSION_LIST_LIMIT = 30

export function deriveChatSessionTitle(message: string) {
  const normalized = message.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 64) return normalized
  return `${normalized.slice(0, 61).trimEnd()}...`
}

export async function createChatSession(userId: string, repositoryId: string) {
  const [session] = await db.insert(chatSessions).values({ userId, repositoryId }).returning()
  return session
}

export async function appendChatMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
) {
  const now = new Date()
  const [message] = await db.insert(chatMessages).values({ sessionId, role, content }).returning()

  if (role === 'user') {
    await db
      .update(chatSessions)
      .set({
        title: sql`coalesce(${chatSessions.title}, ${deriveChatSessionTitle(content)})`,
        updatedAt: now,
      })
      .where(eq(chatSessions.id, sessionId))
  } else {
    await db.update(chatSessions).set({ updatedAt: now }).where(eq(chatSessions.id, sessionId))
  }

  return message
}

export function listChatSessions(
  userId: string,
  repositoryId: string,
  limit = CHAT_SESSION_LIST_LIMIT,
) {
  return db.query.chatSessions.findMany({
    where: and(eq(chatSessions.userId, userId), eq(chatSessions.repositoryId, repositoryId)),
    orderBy: desc(chatSessions.updatedAt),
    limit,
  })
}

export function getChatSession(userId: string, repositoryId: string, sessionId: string) {
  return db.query.chatSessions.findFirst({
    columns: {
      id: true,
      userId: true,
      repositoryId: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
    where: and(
      eq(chatSessions.id, sessionId),
      eq(chatSessions.userId, userId),
      eq(chatSessions.repositoryId, repositoryId),
    ),
  })
}

export function getChatSessionWithMessages(
  userId: string,
  repositoryId: string,
  sessionId: string,
) {
  return db.query.chatSessions.findFirst({
    where: and(
      eq(chatSessions.id, sessionId),
      eq(chatSessions.userId, userId),
      eq(chatSessions.repositoryId, repositoryId),
    ),
    with: {
      messages: {
        orderBy: asc(chatMessages.createdAt),
      },
    },
  })
}

export function getChatHistory(sessionId: string) {
  return db.query.chatMessages.findMany({
    where: eq(chatMessages.sessionId, sessionId),
    orderBy: asc(chatMessages.createdAt),
  })
}

export async function getBoundedChatHistory(sessionId: string, limit = CHAT_MODEL_HISTORY_LIMIT) {
  const messages = await db.query.chatMessages.findMany({
    where: eq(chatMessages.sessionId, sessionId),
    orderBy: desc(chatMessages.createdAt),
    limit,
  })
  return messages.reverse()
}

export async function deleteChatSession(userId: string, repositoryId: string, sessionId: string) {
  const [deleted] = await db
    .delete(chatSessions)
    .where(
      and(
        eq(chatSessions.id, sessionId),
        eq(chatSessions.userId, userId),
        eq(chatSessions.repositoryId, repositoryId),
      ),
    )
    .returning()

  return deleted ?? null
}

// ─── User AI Settings ─────────────────────────────────────────────────────────

export async function getUserAiSettings(userId: string): Promise<UserAiSettings | null> {
  const result = await db
    .select()
    .from(userAiSettings)
    .where(eq(userAiSettings.userId, userId))
    .limit(1)
  return result[0] ?? null
}

export async function upsertUserAiSettings(
  userId: string,
  values: {
    provider: UserAiSettings['provider']
    encryptedApiKey?: string | null
    lmStudioChatModel?: string | null
    lmStudioMindmapModel?: string | null
    lmStudioEmbeddingModel?: string | null
    openrouterChatModel?: string | null
    openrouterMindmapModel?: string | null
    openrouterEmbeddingModel?: string | null
    openrouterEndpoint?: string | null
    anthropicChatModel?: string | null
    anthropicMindmapModel?: string | null
    anthropicEmbeddingModel?: string | null
    openaiChatModel?: string | null
    openaiMindmapModel?: string | null
    openaiEmbeddingModel?: string | null
    openaiEndpoint?: string | null
  },
): Promise<UserAiSettings> {
  const [row] = await db
    .insert(userAiSettings)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: userAiSettings.userId,
      set: { ...values, updatedAt: new Date() },
    })
    .returning()
  return row
}

/** Look up the AI settings for the owner of a given repository. */
export async function getAiSettingsForRepo(repositoryId: string): Promise<UserAiSettings | null> {
  const result = await db
    .select({ settings: userAiSettings })
    .from(repositories)
    .leftJoin(userAiSettings, eq(repositories.userId, userAiSettings.userId))
    .where(eq(repositories.id, repositoryId))
    .limit(1)
  return result[0]?.settings ?? null
}

// ─── Wiki Pages ────────────────────────────────────────────────────────────────

export function getWikiPages(repositoryId: string) {
  return db
    .select()
    .from(wikiPages)
    .where(eq(wikiPages.repositoryId, repositoryId))
    .orderBy(asc(wikiPages.orderIndex))
}

export async function getWikiPageBySlug(repositoryId: string, slug: string) {
  const result = await db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.repositoryId, repositoryId), eq(wikiPages.slug, slug)))
    .limit(1)
  return result[0] ?? null
}

export async function getDocumentMetadataByPaths(repositoryId: string, paths: string[]) {
  if (paths.length === 0) return []
  return db
    .select({
      path: documents.path,
      evidenceTier: documents.evidenceTier,
      evidenceKind: documents.evidenceKind,
      evidenceAlignmentStatus: documents.evidenceAlignmentStatus,
    })
    .from(documents)
    .innerJoin(branches, eq(documents.branchId, branches.id))
    .where(and(eq(branches.repositoryId, repositoryId), inArray(documents.path, paths)))
}

export async function upsertWikiPages(values: NewWikiPage[]) {
  if (values.length === 0) return []
  return db
    .insert(wikiPages)
    .values(values)
    .onConflictDoUpdate({
      target: [wikiPages.repositoryId, wikiPages.slug],
      set: {
        title: wikiPages.title,
        parentSlug: wikiPages.parentSlug,
        orderIndex: wikiPages.orderIndex,
        summary: wikiPages.summary,
        status: wikiPages.status,
        content: wikiPages.content,
        updatedAt: new Date(),
      },
    })
    .returning()
}

export async function updateWikiPage(
  id: string,
  values: Partial<
    Pick<WikiPage, 'status' | 'content' | 'generatedAt' | 'commitSha' | 'summary' | 'sourceFiles'>
  >,
) {
  const [updated] = await db
    .update(wikiPages)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(wikiPages.id, id))
    .returning()
  return updated
}
