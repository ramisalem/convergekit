import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

// ─── Custom types ─────────────────────────────────────────────────────────────

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector'
  },
})

const pgvector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector'
  },
  toDriver(value) {
    return JSON.stringify(value)
  },
  fromDriver(value) {
    if (!value.startsWith('[') || !value.endsWith(']')) return []
    const inner = value.slice(1, -1)
    return inner ? inner.split(',').map((v) => Number.parseFloat(v)) : []
  },
})

// ─── Enums ───────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', ['admin', 'user'])

// ─── Better-auth tables (user, session, account, verification) ────────────────
// These are managed by better-auth. Do NOT rename columns or the adapter breaks.

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  role: userRoleEnum('role').notNull().default('user'),
  groupId: text('group_id').references(() => groups.id, { onDelete: 'set null' }),
  deactivatedAt: timestamp('deactivated_at'),
  ciTokensEnabled: boolean('ci_tokens_enabled').notNull().default(false),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
})

// ─── Groups & Group-Repository assignments ──────────────────────────────────

export const groups = pgTable('groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const groupRepositories = pgTable(
  'group_repositories',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    repositoryId: uuid('repository_id')
      .notNull()
      .references(() => repositories.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.repositoryId] })],
)

// ─── User invitations (invite + admin-initiated password reset) ──────────────

export const userInvitations = pgTable('user_invitations', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const userInvitationsRelations = relations(userInvitations, ({ one }) => ({
  user: one(user, { fields: [userInvitations.userId], references: [user.id] }),
  creator: one(user, { fields: [userInvitations.createdBy], references: [user.id] }),
}))

// ─── JDW-22: Repositories, Branches ──────────────────────────────────────────

export const repositories = pgTable('repositories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  cloneUrl: text('clone_url').notNull(),
  provider: text('provider', { enum: ['github', 'gitlab', 'bitbucket'] }).notNull(),
  defaultBranch: text('default_branch').notNull().default('main'),
  isPrivate: boolean('is_private').notNull().default(false),
  status: text('status', { enum: ['pending', 'processing', 'done', 'failed'] })
    .notNull()
    .default('pending'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const branches = pgTable('branches', {
  id: uuid('id').primaryKey().defaultRandom(),
  repositoryId: uuid('repository_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  lastIndexedAt: timestamp('last_indexed_at'),
  indexedCommitSha: text('indexed_commit_sha'),
  embeddingProvider: text('embedding_provider', {
    enum: ['anthropic', 'openai', 'openrouter', 'lmstudio'],
  }),
  embeddingModel: text('embedding_model'),
  embeddingDimensions: integer('embedding_dimensions'),
  embeddingEndpoint: text('embedding_endpoint'),
  embeddingProfileCapturedAt: timestamp('embedding_profile_captured_at'),
  incrementalIndexingEnabled: boolean('incremental_indexing_enabled').notNull().default(true),
  incrementalPausedAt: timestamp('incremental_paused_at'),
  incrementalPausedBy: text('incremental_paused_by').references(() => user.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─── JDW-23: Documents and Chunks ─────────────────────────────────────────────

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    content: text('content').notNull(),
    // Line count, materialized by Postgres on every write so repository metrics
    // (e.g. the repository-list LOC aggregate) never recompute it on read.
    // newline count + 1 for a final line without a trailing newline; 0 for empty.
    lineCount: integer('line_count')
      .notNull()
      .generatedAlwaysAs(
        sql`(length(content) - length(replace(content, chr(10), ''))) + (case when content = '' then 0 when right(content, 1) = chr(10) then 0 else 1 end)`,
      ),
    programmingLanguage: text('programming_language'),
    docLanguage: text('doc_language').notNull().default('en'),
    evidenceTier: text('evidence_tier', { enum: ['A', 'B', 'C', 'D'] }),
    evidenceKind: text('evidence_kind', {
      enum: [
        'code',
        'test',
        'config',
        'migration',
        'infra',
        'readme',
        'setup_doc',
        'api_doc',
        'adr',
        'design_doc',
        'plan',
      ],
    }),
    searchByDefault: boolean('search_by_default'),
    indexDecisionReason: text('index_decision_reason'),
    lastVerifiedAgainstCodeAt: timestamp('last_verified_against_code_at'),
    verifiedAgainstCommitSha: text('verified_against_commit_sha'),
    evidenceAlignmentStatus: text('evidence_alignment_status', {
      enum: ['unverified', 'aligned', 'stale', 'conflicts'],
    }),
    linkedCodePaths: text('linked_code_paths').array(),
    linkedCodeContentHashes: jsonb('linked_code_content_hashes').$type<Record<string, string>>(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [unique('documents_branch_path_unique').on(t.branchId, t.path)],
)

export const chunks = pgTable(
  'chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    chunkType: text('chunk_type', {
      enum: ['function', 'class', 'method', 'module', 'block', 'comment'],
    }).notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    searchVector: tsvector('search_vector'),
    // Embedding dimensions vary by model and are tracked per indexed branch.
    embedding: pgvector('embedding'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    unique('chunks_document_startline_unique').on(t.documentId, t.startLine),
    // Phase 1: GIN index for keyword search
    index('chunks_search_vector_idx').using('gin', t.searchVector),
    // Phase 2 HNSW index created via raw SQL migration in JDW-41:
    //   CREATE INDEX chunks_embedding_hnsw_idx ON chunks
    //   USING hnsw (embedding vector_cosine_ops)
    //   WITH (m = 16, ef_construction = 64);
  ],
)

// ─── User AI Settings ─────────────────────────────────────────────────────────

export const userAiSettings = pgTable('user_ai_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Active provider: 'anthropic' | 'openai' | 'openrouter' | 'lmstudio'
  provider: text('provider', { enum: ['anthropic', 'openai', 'openrouter', 'lmstudio'] })
    .notNull()
    .default('lmstudio'),
  // AES-256-GCM encrypted API key: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
  encryptedApiKey: text('encrypted_api_key'),
  // Per-user LM Studio model overrides (null → fall back to env var defaults)
  lmStudioChatModel: text('lm_studio_chat_model'),
  lmStudioMindmapModel: text('lm_studio_mindmap_model'),
  lmStudioEmbeddingModel: text('lm_studio_embedding_model'),
  // Per-user OpenRouter model overrides (null → fall back to hardcoded defaults)
  openrouterChatModel: text('openrouter_chat_model'),
  openrouterMindmapModel: text('openrouter_mindmap_model'),
  openrouterEmbeddingModel: text('openrouter_embedding_model'),
  openrouterEndpoint: text('openrouter_endpoint'),
  // Per-user Anthropic model overrides
  anthropicChatModel: text('anthropic_chat_model'),
  anthropicMindmapModel: text('anthropic_mindmap_model'),
  anthropicEmbeddingModel: text('anthropic_embedding_model'),
  // Per-user OpenAI model overrides
  openaiChatModel: text('openai_chat_model'),
  openaiMindmapModel: text('openai_mindmap_model'),
  openaiEmbeddingModel: text('openai_embedding_model'),
  openaiEndpoint: text('openai_endpoint'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ─── Wiki Pages ───────────────────────────────────────────────────────────────

export const wikiPages = pgTable(
  'wiki_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repositoryId: uuid('repository_id')
      .notNull()
      .references(() => repositories.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    parentSlug: text('parent_slug'),
    orderIndex: integer('order_index').notNull().default(0),
    content: text('content').notNull().default(''),
    summary: text('summary'),
    sourceFiles: text('source_files').array(),
    status: text('status', { enum: ['pending', 'generating', 'done', 'failed'] })
      .notNull()
      .default('pending'),
    generatedAt: timestamp('generated_at'),
    commitSha: text('commit_sha'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    unique('wiki_pages_repo_slug_unique').on(t.repositoryId, t.slug),
    index('wiki_pages_repo_idx').on(t.repositoryId),
    index('wiki_pages_parent_idx').on(t.repositoryId, t.parentSlug),
  ],
)

// ─── Incremental indexing runs ────────────────────────────────────────────────
// Product-visible source of truth for full + incremental indexing runs. The UI
// reads incremental rows; future global dashboards can read full rows too.

export const indexingRuns = pgTable(
  'indexing_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repositoryId: uuid('repository_id')
      .notNull()
      .references(() => repositories.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['full', 'incremental'] }).notNull(),
    trigger: text('trigger', { enum: ['scheduled', 'manual', 'full_reindex'] }).notNull(),
    status: text('status', {
      enum: [
        'checking',
        'queued',
        'processing',
        'completed',
        'completed_noop',
        'failed',
        'skipped',
      ],
    }).notNull(),
    queueName: text('queue_name'),
    jobId: text('job_id'),
    fromCommit: text('from_commit'),
    toCommit: text('to_commit'),
    remoteHead: text('remote_head'),
    changedFileCount: integer('changed_file_count').notNull().default(0),
    deletedFileCount: integer('deleted_file_count').notNull().default(0),
    skippedFileCount: integer('skipped_file_count').notNull().default(0),
    chunkCount: integer('chunk_count').notNull().default(0),
    skippedEmbeddingCount: integer('skipped_embedding_count').notNull().default(0),
    failureReason: text('failure_reason'),
    failureCode: text('failure_code'),
    startedAt: timestamp('started_at'),
    finishedAt: timestamp('finished_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('indexing_runs_repo_created_idx').on(t.repositoryId, t.createdAt),
    index('indexing_runs_branch_status_idx').on(t.branchId, t.status),
  ],
)

// ─── JDW-24: Chat Sessions, Messages, and MCP Tokens ─────────────────────────

export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  repositoryId: uuid('repository_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  title: text('title'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => chatSessions.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const mcpTokens = pgTable(
  'mcp_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repositoryId: uuid('repository_id').references(() => repositories.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // SHA-256 hex of the raw token — never store plaintext
    tokenHash: text('token_hash').notNull(),
    fingerprint: text('fingerprint').notNull(),
    label: text('label').notNull(),
    scopes: text('scopes').array().notNull().default(['repo:read', 'docs:search', 'files:read']),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    revokedReason: text('revoked_reason'),
    lastUsedIp: text('last_used_ip'),
    lastUsedUserAgent: text('last_used_user_agent'),
    lastUsedClientName: text('last_used_client_name'),
    lastUsedToolName: text('last_used_tool_name'),
    rotatedFromTokenId: uuid('rotated_from_token_id'),
    lastUsedAt: timestamp('last_used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    unique('mcp_tokens_token_hash_unique').on(t.tokenHash),
    index('mcp_tokens_repository_user_idx').on(t.repositoryId, t.userId),
    index('mcp_tokens_active_idx').on(t.revokedAt, t.expiresAt),
  ],
)

export const mcpTokenAuditEvents = pgTable(
  'mcp_token_audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenId: uuid('token_id').references(() => mcpTokens.id, { onDelete: 'set null' }),
    repositoryId: uuid('repository_id').references(() => repositories.id, { onDelete: 'set null' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    tokenLabel: text('token_label'),
    tokenFingerprint: text('token_fingerprint'),
    principalKind: text('principal_kind', { enum: ['static', 'oauth'] })
      .notNull()
      .default('static'),
    clientId: text('client_id'),
    oauthTokenId: uuid('oauth_token_id').references(() => mcpOauthToken.id, {
      onDelete: 'set null',
    }),
    clientLabel: text('client_label'),
    clientName: text('client_name'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    method: text('method').notNull(),
    toolName: text('tool_name'),
    latencyMs: integer('latency_ms').notNull().default(0),
    status: text('status', { enum: ['success', 'failure', 'rate_limited'] }).notNull(),
    statusCode: integer('status_code'),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('mcp_token_audit_events_token_idx').on(t.tokenId, t.createdAt),
    index('mcp_token_audit_events_repo_idx').on(t.repositoryId, t.createdAt),
  ],
)

export const mcpTokenAlerts = pgTable(
  'mcp_token_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenId: uuid('token_id')
      .notNull()
      .references(() => mcpTokens.id, { onDelete: 'cascade' }),
    repositoryId: uuid('repository_id').references(() => repositories.id, {
      onDelete: 'cascade',
    }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    message: text('message').notNull(),
    details: text('details'),
    status: text('status', { enum: ['open', 'acknowledged'] })
      .notNull()
      .default('open'),
    firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
    acknowledgedAt: timestamp('acknowledged_at'),
  },
  (t) => [
    index('mcp_token_alerts_token_status_idx').on(t.tokenId, t.status),
    index('mcp_token_alerts_repo_status_idx').on(t.repositoryId, t.status),
  ],
)

export const mcpOauthToken = pgTable(
  'mcp_oauth_token',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // DCR client id (oauth_application.client_id). No FK: the client table is owned
    // by the better-auth MCP plugin and created in plan 1b; keep this decoupled.
    clientId: text('client_id').notNull(),
    // SHA-256 hex of the raw tokens — never store plaintext.
    accessTokenHash: text('access_token_hash').notNull(),
    refreshTokenHash: text('refresh_token_hash'),
    scopes: text('scopes').array().notNull(),
    accessTokenExpiresAt: timestamp('access_token_expires_at').notNull(),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    // Family creation + 60d. Unchanged by rotation — the absolute cap.
    absoluteExpiresAt: timestamp('absolute_expires_at').notNull(),
    rotatedFromId: uuid('rotated_from_id'),
    revokedAt: timestamp('revoked_at'),
    revokedReason: text('revoked_reason'),
    lastUsedAt: timestamp('last_used_at'),
    lastUsedIp: text('last_used_ip'),
    lastUsedUserAgent: text('last_used_user_agent'),
    lastUsedClientName: text('last_used_client_name'),
    lastUsedToolName: text('last_used_tool_name'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    unique('mcp_oauth_token_access_hash_unique').on(t.accessTokenHash),
    unique('mcp_oauth_token_refresh_hash_unique').on(t.refreshTokenHash),
    index('mcp_oauth_token_user_idx').on(t.userId),
    index('mcp_oauth_token_family_idx').on(t.familyId),
    index('mcp_oauth_token_client_idx').on(t.clientId),
    index('mcp_oauth_token_active_idx').on(t.revokedAt, t.accessTokenExpiresAt),
  ],
)

export const mcpOauthAuthorizationCode = pgTable(
  'mcp_oauth_authorization_code',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codeHash: text('code_hash').notNull(),
    clientId: text('client_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    redirectUri: text('redirect_uri').notNull(),
    scopes: text('scopes').array().notNull(),
    codeChallenge: text('code_challenge').notNull(),
    codeChallengeMethod: text('code_challenge_method').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    consumedAt: timestamp('consumed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    unique('mcp_oauth_authorization_code_hash_unique').on(t.codeHash),
    index('mcp_oauth_authorization_code_user_idx').on(t.userId),
  ],
)

// ─── Better Auth MCP plugin (DCR) tables — field names must match the plugin ───
export const oauthApplication = pgTable('oauth_application', {
  id: text('id').primaryKey(),
  name: text('name'),
  icon: text('icon'),
  metadata: text('metadata'),
  clientId: text('client_id').notNull().unique(),
  clientSecret: text('client_secret'),
  redirectUrls: text('redirect_urls'),
  type: text('type'),
  disabled: boolean('disabled').default(false),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
})

export const oauthAccessToken = pgTable('oauth_access_token', {
  id: text('id').primaryKey(),
  accessToken: text('access_token').unique(),
  refreshToken: text('refresh_token').unique(),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  clientId: text('client_id'),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  scopes: text('scopes'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
})

export const oauthConsent = pgTable('oauth_consent', {
  id: text('id').primaryKey(),
  clientId: text('client_id'),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  scopes: text('scopes'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
  consentGiven: boolean('consent_given'),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const userRelations = relations(user, ({ one, many }) => ({
  repositories: many(repositories),
  chatSessions: many(chatSessions),
  mcpTokens: many(mcpTokens),
  mcpTokenAuditEvents: many(mcpTokenAuditEvents),
  mcpTokenAlerts: many(mcpTokenAlerts),
  aiSettings: one(userAiSettings, { fields: [user.id], references: [userAiSettings.userId] }),
  group: one(groups, { fields: [user.groupId], references: [groups.id] }),
}))

export const userAiSettingsRelations = relations(userAiSettings, ({ one }) => ({
  user: one(user, { fields: [userAiSettings.userId], references: [user.id] }),
}))

export const repositoriesRelations = relations(repositories, ({ one, many }) => ({
  user: one(user, { fields: [repositories.userId], references: [user.id] }),
  branches: many(branches),
  chatSessions: many(chatSessions),
  mcpTokens: many(mcpTokens),
  mcpTokenAuditEvents: many(mcpTokenAuditEvents),
  mcpTokenAlerts: many(mcpTokenAlerts),
  wikiPages: many(wikiPages),
  groupRepositories: many(groupRepositories),
  indexingRuns: many(indexingRuns),
}))

export const branchesRelations = relations(branches, ({ one, many }) => ({
  repository: one(repositories, { fields: [branches.repositoryId], references: [repositories.id] }),
  documents: many(documents),
  indexingRuns: many(indexingRuns),
}))

export const documentsRelations = relations(documents, ({ one, many }) => ({
  branch: one(branches, { fields: [documents.branchId], references: [branches.id] }),
  chunks: many(chunks),
}))

export const chunksRelations = relations(chunks, ({ one }) => ({
  document: one(documents, { fields: [chunks.documentId], references: [documents.id] }),
}))

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  user: one(user, { fields: [chatSessions.userId], references: [user.id] }),
  repository: one(repositories, {
    fields: [chatSessions.repositoryId],
    references: [repositories.id],
  }),
  messages: many(chatMessages),
}))

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, { fields: [chatMessages.sessionId], references: [chatSessions.id] }),
}))

export const mcpTokensRelations = relations(mcpTokens, ({ one }) => ({
  repository: one(repositories, {
    fields: [mcpTokens.repositoryId],
    references: [repositories.id],
  }),
  user: one(user, { fields: [mcpTokens.userId], references: [user.id] }),
  rotatedFrom: one(mcpTokens, {
    fields: [mcpTokens.rotatedFromTokenId],
    references: [mcpTokens.id],
  }),
}))

export const mcpTokenAuditEventsRelations = relations(mcpTokenAuditEvents, ({ one }) => ({
  token: one(mcpTokens, { fields: [mcpTokenAuditEvents.tokenId], references: [mcpTokens.id] }),
  repository: one(repositories, {
    fields: [mcpTokenAuditEvents.repositoryId],
    references: [repositories.id],
  }),
  user: one(user, { fields: [mcpTokenAuditEvents.userId], references: [user.id] }),
}))

export const mcpTokenAlertsRelations = relations(mcpTokenAlerts, ({ one }) => ({
  token: one(mcpTokens, { fields: [mcpTokenAlerts.tokenId], references: [mcpTokens.id] }),
  repository: one(repositories, {
    fields: [mcpTokenAlerts.repositoryId],
    references: [repositories.id],
  }),
  user: one(user, { fields: [mcpTokenAlerts.userId], references: [user.id] }),
}))

export const wikiPagesRelations = relations(wikiPages, ({ one }) => ({
  repository: one(repositories, {
    fields: [wikiPages.repositoryId],
    references: [repositories.id],
  }),
  branch: one(branches, {
    fields: [wikiPages.branchId],
    references: [branches.id],
  }),
}))

export const indexingRunsRelations = relations(indexingRuns, ({ one }) => ({
  repository: one(repositories, {
    fields: [indexingRuns.repositoryId],
    references: [repositories.id],
  }),
  branch: one(branches, { fields: [indexingRuns.branchId], references: [branches.id] }),
}))

export const groupsRelations = relations(groups, ({ many }) => ({
  users: many(user),
  groupRepositories: many(groupRepositories),
}))

export const groupRepositoriesRelations = relations(groupRepositories, ({ one }) => ({
  group: one(groups, { fields: [groupRepositories.groupId], references: [groups.id] }),
  repository: one(repositories, {
    fields: [groupRepositories.repositoryId],
    references: [repositories.id],
  }),
}))

// ─── Inferred types ───────────────────────────────────────────────────────────

export type User = typeof user.$inferSelect
export type NewUser = typeof user.$inferInsert

export type Repository = typeof repositories.$inferSelect
export type NewRepository = typeof repositories.$inferInsert

export type Branch = typeof branches.$inferSelect
export type NewBranch = typeof branches.$inferInsert

export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert

export type Chunk = typeof chunks.$inferSelect
export type NewChunk = typeof chunks.$inferInsert

export type ChatSession = typeof chatSessions.$inferSelect
export type NewChatSession = typeof chatSessions.$inferInsert

export type ChatMessage = typeof chatMessages.$inferSelect
export type NewChatMessage = typeof chatMessages.$inferInsert

export type McpToken = typeof mcpTokens.$inferSelect
export type NewMcpToken = typeof mcpTokens.$inferInsert

export type McpTokenAuditEvent = typeof mcpTokenAuditEvents.$inferSelect
export type NewMcpTokenAuditEvent = typeof mcpTokenAuditEvents.$inferInsert

export type McpTokenAlert = typeof mcpTokenAlerts.$inferSelect
export type NewMcpTokenAlert = typeof mcpTokenAlerts.$inferInsert

export type McpOauthToken = typeof mcpOauthToken.$inferSelect
export type NewMcpOauthToken = typeof mcpOauthToken.$inferInsert

export type McpOauthAuthorizationCode = typeof mcpOauthAuthorizationCode.$inferSelect
export type NewMcpOauthAuthorizationCode = typeof mcpOauthAuthorizationCode.$inferInsert

export type WikiPage = typeof wikiPages.$inferSelect
export type NewWikiPage = typeof wikiPages.$inferInsert

export type UserAiSettings = typeof userAiSettings.$inferSelect
export type NewUserAiSettings = typeof userAiSettings.$inferInsert

export type Group = typeof groups.$inferSelect
export type NewGroup = typeof groups.$inferInsert

export type GroupRepository = typeof groupRepositories.$inferSelect
export type NewGroupRepository = typeof groupRepositories.$inferInsert

export type UserInvitation = typeof userInvitations.$inferSelect
export type NewUserInvitation = typeof userInvitations.$inferInsert

export type IndexingRun = typeof indexingRuns.$inferSelect
export type NewIndexingRun = typeof indexingRuns.$inferInsert
