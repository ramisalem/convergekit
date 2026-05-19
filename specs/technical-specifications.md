# ConvergeKit Technical Implementation Details

ConvergeKit is a sophisticated, AI-enhanced repository documentation and knowledge management system. It leverages a unified TypeScript full-stack architecture to provide deep insights into software repositories using advanced AI models and the Model Context Protocol (MCP).

---

## 1. High-Level Architecture

ConvergeKit follows a **Clean Architecture** pattern across a TypeScript-first monorepo, separating concerns into discrete layers with shared types eliminating API contract drift.

```
┌─────────────────────────────────────────────────────┐
│                    Turborepo Monorepo                │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │  apps/web   │  │  apps/api   │  │ apps/worker │ │
│  │  (Next.js)  │  │   (Hono)    │  │  (BullMQ)   │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
│         │                │                 │         │
│  ┌──────▼─────────────────▼─────────────────▼──────┐ │
│  │              packages/                           │ │
│  │  types │ queues │ db │ ai │ auth │ mcp │ config  │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
         │                │                 │
    ┌────▼────┐      ┌────▼────┐      ┌────▼────┐
    │PostgreSQL│      │  Redis  │      │Local FS /│
    │+ pgvector│      │(Cache + │      │  Object  │
    │          │      │  Queue) │      │  Store   │
    └──────────┘      └─────────┘      └──────────┘
```

**Layers:**
- **Frontend** (`apps/web`): Next.js 15 (App Router, React 19) — documentation UI, management dashboard, chat interface.
- **Backend API** (`apps/api`): Hono — lightweight, TypeScript-first HTTP server acting as the central orchestrator.
- **Worker Process** (`apps/worker`): Standalone Node.js process — BullMQ consumers for all async tasks.
- **Shared Packages** (`packages/`): Types, DB schema, queue definitions, AI clients, auth config — imported by all apps. Single source of truth.
- **Data Layer**: PostgreSQL with pgvector extension (production), SQLite (development).
- **State Layer**: Redis — distributed cache, job queue backing store, pub/sub for real-time events.

---

## 2. Monorepo Structure (Turborepo)

Turborepo manages the build graph, caching, and task orchestration across all apps and packages.

```
convergekit/
├── apps/
│   ├── web/          # Next.js 15 frontend
│   ├── api/          # Hono backend API
│   └── worker/       # BullMQ worker process
├── packages/
│   ├── types/        # Shared TypeScript interfaces and Zod schemas
│   ├── db/           # Drizzle ORM schema, migrations, and query helpers
│   ├── queues/       # BullMQ queue definitions and job type contracts
│   ├── ai/           # Vercel AI SDK configuration and agent utilities
│   ├── auth/         # better-auth configuration shared across apps
│   ├── mcp/          # MCP server definition and tool implementations
│   └── config/       # Shared environment variable parsing (via t3-env)
├── compose.yaml      # Full local dev stack (PostgreSQL, Redis)
├── turbo.json
└── package.json      # Root workspace
```

**Key benefit**: `packages/types` is imported by both `apps/web` and `apps/api`. API request/response shapes are defined once as Zod schemas — the same schema validates the server payload and types the frontend client. No drift, no manual sync.

---

## 3. Backend API (`apps/api` — Hono)

### 3.1 Core Technologies
- **Framework**: Hono — minimal, edge-compatible, TypeScript-native HTTP framework.
- **Runtime**: Node.js 20 LTS (compatible with Bun for future performance optimization).
- **Validation**: Zod via `@hono/zod-validator` — request bodies are validated and typed at the route level.
- **Logging**: Pino — structured JSON logging, low overhead.
- **Error Handling**: Centralized Hono error handler mapping domain errors to HTTP status codes.

### 3.2 API Style
Hono's route definition pattern mirrors Minimal APIs — handlers are co-located with their route definitions, grouped by domain using `Hono` sub-applications.

```
/api/
├── /auth/           # better-auth handler (login, callback, session)
├── /repositories/   # CRUD + enqueue analysis
├── /documents/      # Documentation CRUD and search
├── /chat/           # Streaming chat with RAG
├── /jobs/           # Job status polling endpoint
├── /mcp/            # MCP SSE endpoint
└── /notifications/  # SSE stream for real-time job progress
```

### 3.3 Authentication
- **Library**: `better-auth` — handles JWT issuance, session management, and OAuth2 provider flows.
- **Providers**: GitHub and Google OAuth2.
- **Mechanism**: HTTP-only cookie sessions for browser clients; Bearer JWT for MCP and programmatic clients.
- **Middleware**: A Hono middleware validates the session/token and attaches the authenticated user to the request context on all protected routes.

### 3.4 Dynamic Database Support
Drizzle ORM supports multiple drivers via a single schema. The active driver is selected at startup via environment configuration:
- **Production**: `drizzle-orm/postgres-js` with PostgreSQL.
- **Development**: `drizzle-orm/better-sqlite3` with SQLite.

No dynamic assembly loading or conditional compilation is required — the schema is identical across both drivers.

---

## 4. Data Layer (`packages/db` — Drizzle ORM)

### 4.1 Core Technologies
- **ORM**: Drizzle ORM — schema-as-TypeScript, zero magic, plain SQL under the hood.
- **Migrations**: `drizzle-kit` generates SQL migration files from schema changes. Migrations are committed to source control and applied at deploy time.
- **Databases**: PostgreSQL with `pgvector` extension (production), SQLite (development).

### 4.2 Key Entities

```typescript
// packages/db/src/schema.ts (abbreviated)

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const repositories = pgTable('repositories', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => users.id),
  name: text('name').notNull(),
  cloneUrl: text('clone_url').notNull(),
  provider: text('provider').notNull(),  // 'github' | 'gitlab' | 'bitbucket'
  status: text('status').notNull(),      // 'pending' | 'processing' | 'ready' | 'failed'
  createdAt: timestamp('created_at').defaultNow(),
})

export const branches = pgTable('branches', {
  id: uuid('id').primaryKey().defaultRandom(),
  repositoryId: uuid('repository_id').references(() => repositories.id),
  name: text('name').notNull(),
  lastIndexedAt: timestamp('last_indexed_at'),
})

// One row per file — stores raw content and file-level metadata.
// Does NOT store the embedding vector; that lives on chunks.
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  branchId: uuid('branch_id').references(() => branches.id),
  path: text('path').notNull(),
  content: text('content').notNull(),
  programmingLanguage: text('programming_language'),  // 'typescript' | 'python' | 'go' | null (for docs/config)
  docLanguage: text('doc_language').notNull().default('en'),  // i18n language of the content
  updatedAt: timestamp('updated_at').defaultNow(),
})

// One row per embeddable unit — a semantic sub-division of a document.
// Source files are chunked at function/class/method boundaries via tree-sitter.
// Markdown files are chunked at heading section boundaries.
// Config files are chunked at top-level key groups.
export const chunks = pgTable('chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  chunkType: text('chunk_type').notNull(),  // 'function' | 'class' | 'module' | 'section' | 'config'
  startLine: integer('start_line').notNull(),
  endLine: integer('end_line').notNull(),
  // Phase 1 — full-text keyword search
  searchVector: tsvector('search_vector'),
  // Phase 2 — semantic vector (voyage-code-3 produces 1024-dimensional vectors)
  embedding: vector('embedding', { dimensions: 1024 }),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  repositoryId: uuid('repository_id').references(() => repositories.id),
  createdAt: timestamp('created_at').defaultNow(),
})

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => chatSessions.id),
  role: text('role').notNull(),  // 'user' | 'assistant'
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

// Scoped API tokens for MCP client access
export const mcpTokens = pgTable('mcp_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  repositoryId: uuid('repository_id').references(() => repositories.id),
  userId: uuid('user_id').references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),
  label: text('label'),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').defaultNow(),
})
```

### 4.3 Search Indexes

```sql
-- Migration: Phase 1 — keyword search on chunks
CREATE INDEX chunks_search_vector_idx ON chunks USING GIN (search_vector);

-- Trigger to auto-update tsvector on chunk content change
CREATE TRIGGER chunks_search_vector_update
  BEFORE INSERT OR UPDATE ON chunks
  FOR EACH ROW EXECUTE FUNCTION
  tsvector_update_trigger(search_vector, 'pg_catalog.english', content);

-- Migration: Phase 2 — semantic search on chunks (requires pgvector >= 0.5.0)
CREATE EXTENSION IF NOT EXISTS vector;

-- HNSW index: higher recall than ivfflat, no calibration required,
-- builds incrementally as rows are inserted (no training pass on empty table).
-- m=16 and ef_construction=64 are well-tested defaults for recall/build-time balance.
CREATE INDEX chunks_embedding_idx ON chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

---

## 5. Background Processing (`apps/worker` — BullMQ)

### 5.1 Architecture
The worker is a **separate Node.js process**, not co-located with the API. This isolates CPU/memory-intensive tasks (cloning, LLM calls) from the request-response cycle and allows independent scaling.

```
API Process  →  Enqueue job (Redis)  →  Worker Process
                                              ↓
                                      Pick up job
                                              ↓
                                      Process (clone/analyze/embed)
                                              ↓
                                      Emit progress events (Redis pub/sub)
                                              ↓
                                      Chain dependent jobs
```

### 5.2 Queue Definitions (`packages/queues`)
Queue contracts are defined once in the shared package, imported by both the API (to enqueue) and the worker (to consume).

```typescript
// packages/queues/src/index.ts

export type RepositoryJobData = {
  repositoryId: string
  cloneUrl: string
  branch: string
  languages: string[]
}

export type TranslationJobData = {
  repositoryId: string
  documentId: string
  targetLanguage: string
}

export type IncrementalJobData = {
  repositoryId: string
  branch: string
  changedFiles: string[]
}

export type MindMapJobData = {
  repositoryId: string
}
```

### 5.3 Queue Priority Lanes

| Queue | Priority | Trigger | Rationale |
|---|---|---|---|
| `repository` | 1 (critical) | User action | User is actively waiting for first-time analysis |
| `incremental` | 2 (default) | Scheduled / webhook | Time-sensitive but not blocking |
| `translation` | 3 (low) | Chained from `repository` | User not actively waiting |
| `mindmap` | 3 (low) | Chained from `repository` | Cosmetic output, no urgency |

### 5.4 Retry and Durability Policy

```typescript
defaultJobOptions: {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 86400 },      // retain 24h for audit
  removeOnFail:    { age: 604800 },      // retain failures 7 days
}
```

Failed jobs after exhausting retries are retained in the dead-letter queue for manual inspection via the Bull Board dashboard.

### 5.5 Worker Implementations

**RepositoryWorker** — the primary worker, chains all subsequent jobs on completion:
1. Clone repository to ephemeral local workspace
2. Walk file system, identify key files; write one `documents` row per file
3. **Chunk each file using `tree-sitter`** (AST-aware boundaries for source code) or heading-based splitting for Markdown/config. Write one `chunks` row per unit.
4. Batch-embed all chunks via `voyage-code-3` using `embedMany()` (max 128 chunks per API call to respect rate limits)
5. Write embedding vectors back to the corresponding `chunks` rows in PostgreSQL
6. Emit progress at each stage via `job.updateProgress()`
7. Chain `TranslationJob` (one per target language) and `MindMapJob`
8. Clean up local workspace

**Chunking rules by file type:**

| File type | Splitter | Chunk boundary |
|---|---|---|
| Source code (TS, JS, Python, Go, etc.) | `tree-sitter` | Function, class, method declarations |
| Markdown / RST | Heading splitter | H2 / H3 sections |
| JSON / YAML / TOML config | Key-group splitter | Top-level keys and their subtrees |
| Plain text / unknown | Sentence splitter | ~512 token windows with 50-token overlap |

**IncrementalWorker** — diff-aware re-indexing:
1. Fetch list of changed files since `lastIndexedAt`
2. Re-extract and re-embed only affected documents
3. Update `branches.lastIndexedAt`

**TranslationWorker** — per-language, per-document:
1. Retrieve source document content
2. Call AI SDK with translation prompt
3. Upsert translated `documents` row with `language` set

**MindMapWorker** — generates a JSON mind map artifact:
1. Load repository structure from DB
2. Call AI SDK to generate a hierarchical mind map structure
3. Store result as a document with `path = '__mindmap__'`

### 5.6 Scheduled Jobs (Incremental Sync)

BullMQ's repeatable jobs replace the previous `IncrementalUpdateWorker` cron:

```typescript
await incrementalQueue.add(
  'sync',
  { repositoryId, branch },
  { repeat: { pattern: '0 */6 * * *' } }  // every 6 hours
)
```

---

## 6. AI and Agent Layer (`packages/ai` — Vercel AI SDK)

### 6.1 Core Technologies
- **SDK**: Vercel AI SDK (`ai` package) — multi-provider, TypeScript-native, supports streaming and tool-calling.
- **Chat/Generation Providers**: Anthropic (`@ai-sdk/anthropic`), OpenAI (`@ai-sdk/openai`), Azure OpenAI (`@ai-sdk/azure`). The active provider is selected via environment configuration — no code changes required to switch.
- **Embedding Provider**: Voyage AI (`voyage-code-3`) — a dedicated, code-specialized embedding model. Used exclusively for indexing and retrieval. Kept separate from the chat provider configuration so each can be swapped independently.

### 6.2 Agent Factory

A shared `createAgent()` utility wraps the SDK and provides a consistent interface across chat, RAG synthesis, translation, and mind map generation:

```typescript
// packages/ai/src/agent.ts

import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { generateText, streamText, tool } from 'ai'

export function getModel(provider?: string) {
  switch (provider ?? process.env.AI_PROVIDER) {
    case 'anthropic': return anthropic('claude-sonnet-4-6')
    case 'openai':    return openai('gpt-4o')
    default:          return anthropic('claude-sonnet-4-6')
  }
}
```

### 6.3 RAG Chat Pipeline

The chat endpoint implements a two-phase RAG pattern:

1. **Retrieval**: Perform hybrid search (keyword + semantic) against `documents` for the given `repositoryId`.
2. **Augmentation**: Inject retrieved document snippets as system context.
3. **Generation**: Stream the AI response back to the client via Hono's SSE response.

```typescript
// apps/api/src/routes/chat.ts (abbreviated)

app.post('/chat', async (c) => {
  const { sessionId, message, repositoryId } = await c.req.json()

  // Phase 1: Retrieve relevant documents
  const context = await searchDocuments(repositoryId, message, { limit: 5 })

  // Phase 2: Stream AI response with retrieved context
  const result = await streamText({
    model: getModel(),
    system: buildSystemPrompt(context),
    messages: await getChatHistory(sessionId),
    tools: {
      searchDocs: searchDocsTool(repositoryId),
      readFile:   readFileTool(repositoryId),
      getStructure: getStructureTool(repositoryId),
    },
  })

  return result.toDataStreamResponse()
})
```

### 6.4 Embedding Generation

Embeddings use `voyage-code-3` — a code-specialized model from Voyage AI (an Anthropic portfolio company). It produces 1024-dimensional vectors and natively bridges natural language queries to code constructs, which is the primary retrieval pattern for this system.

`text-embedding-3-small` (a general-purpose text model) is explicitly **not used** — it has no understanding of code structure, identifier semantics, or the relationship between prose queries and code implementations.

```typescript
// packages/ai/src/embeddings.ts

import { embedMany, embed } from 'ai'
import { createVoyage } from '@ai-sdk/voyage'

const voyage = createVoyage({ apiKey: process.env.VOYAGE_API_KEY })
export const embeddingModel = voyage.textEmbeddingModel('voyage-code-3')

// Index-time: batch embed chunks for a repository.
// Max 128 per call to stay within Voyage API rate limits.
export async function embedChunks(contents: string[]): Promise<number[][]> {
  const batches = chunk(contents, 128)
  const results: number[][] = []

  for (const batch of batches) {
    const { embeddings } = await embedMany({
      model: embeddingModel,
      values: batch,
    })
    results.push(...embeddings)
  }

  return results
}

// Query-time: embed the user's search query with the same model.
// Results are cached in Redis by query string (TTL: 60s) to avoid
// redundant API calls for repeated or similar queries.
export async function embedQuery(query: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: query,
  })
  return embedding
}
```

**Fallback for air-gapped / cost-sensitive deployments**: `nomic-embed-code` (open source, self-hostable via Ollama) can be substituted by changing `embeddingModel` — the rest of the pipeline is model-agnostic. Dimensions drop to 768; the schema migration adjusts the vector column accordingly.

---

## 7. Search and Indexing (`packages/db`)

### 7.1 Two-Phase Search Strategy

Search is implemented in two phases to balance delivery speed with long-term quality. Both phases operate on the `chunks` table — not `documents` — because the embeddable unit is the chunk, not the file.

**Phase 1 — Keyword Search (ships at launch):**
- PostgreSQL `tsvector` + GIN index on `chunks.search_vector`.
- Zero new infrastructure, zero additional latency.
- Handles exact identifier lookups well (`getUserById`, `AuthMiddleware`, `ECONNREFUSED`).

**Phase 2 — Semantic Search (pgvector + voyage-code-3):**
- `pgvector` HNSW index on `chunks.embedding` (1024 dimensions).
- Chunks embedded at index time; queries embedded at search time.
- Handles conceptual queries well ("how does auth work", "where is rate limiting applied").
- The HNSW index builds incrementally — no training pass on existing data required.

### 7.2 Query Classifier

A static 30/70 keyword/semantic split is incorrect for code retrieval. The optimal weighting depends on query type:

| Query type | Signal | Weight |
|---|---|---|
| Identifier / symbol (`getUserById`, `AuthMiddleware`) | Exact name is the answer | 90% keyword / 10% semantic |
| Error string (`ECONNREFUSED`, `relation does not exist`) | Exact match only | 95% keyword / 5% semantic |
| Conceptual (`how does auth work`) | No exact tokens to match | 20% keyword / 80% semantic |
| API usage (`how to call the search endpoint`) | Mixed | 40% keyword / 60% semantic |

A lightweight classifier detects query type from surface patterns before calling the search query:

```typescript
// packages/db/src/search.ts

type QueryWeights = { keyword: number; semantic: number }

export function classifyQuery(query: string): QueryWeights {
  // Identifier patterns: camelCase, PascalCase, snake_case, dot.notation, brackets
  const isIdentifier = /\b([a-z]+[A-Z][a-zA-Z]*|[A-Z][a-zA-Z]+|[a-z_]+\.[a-z_]+|\w+\()/
    .test(query)

  // Error / code literal patterns: ALL_CAPS, error codes, quoted strings with symbols
  const isErrorLiteral = /\b[A-Z_]{3,}\b|["'`][^"'`]+["'`]/.test(query)

  if (isErrorLiteral) return { keyword: 0.95, semantic: 0.05 }
  if (isIdentifier)   return { keyword: 0.90, semantic: 0.10 }

  // Conceptual: mostly lowercase prose with no code-like tokens
  const wordCount = query.trim().split(/\s+/).length
  if (wordCount >= 4)  return { keyword: 0.20, semantic: 0.80 }

  // Default: balanced
  return { keyword: 0.40, semantic: 0.60 }
}
```

### 7.3 Hybrid Search Implementation

Searches the `chunks` table with dynamic weighting, returning chunk content plus the parent file path and line range for context attribution:

```typescript
// packages/db/src/search.ts

export async function searchChunks(
  repositoryId: string,
  query: string,
  opts: {
    limit: number
    chunkType?: 'function' | 'class' | 'module' | 'section' | 'config'
    programmingLanguage?: string
  }
) {
  const weights = classifyQuery(query)
  const queryEmbedding = await embedQuery(query)  // cached in Redis by query string

  return db.execute(sql`
    SELECT
      c.id,
      c.content,
      c.chunk_type,
      c.start_line,
      c.end_line,
      d.path,
      d.programming_language,
      (
        ${weights.keyword} * ts_rank(c.search_vector, plainto_tsquery('english', ${query})) +
        ${weights.semantic} * (1 - (c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector))
      ) AS score
    FROM chunks c
    JOIN documents d ON c.document_id = d.id
    JOIN branches b  ON d.branch_id   = b.id
    WHERE
      b.repository_id = ${repositoryId}
      AND d.doc_language = 'en'
      ${opts.chunkType         ? sql`AND c.chunk_type          = ${opts.chunkType}`         : sql``}
      ${opts.programmingLanguage ? sql`AND d.programming_language = ${opts.programmingLanguage}` : sql``}
    ORDER BY score DESC
    LIMIT ${opts.limit}
  `)
}
```

Retrieved chunks include `path`, `startLine`, and `endLine` so the LLM can cite exact source locations in its response — and so the UI can render source links directly to the file and line range.

---

## 8. MCP Server (`packages/mcp`)

### 8.1 Core Technologies
- **SDK**: `@modelcontextprotocol/sdk` — Anthropic's official TypeScript MCP SDK.
- **Transport**: SSE (Server-Sent Events) — mounted at `/api/mcp` in the Hono application.

### 8.2 Exposed Tools

| Tool | Description |
|---|---|
| `search_docs(query)` | Hybrid search over indexed documentation for the scoped repository |
| `get_structure(path?)` | Returns the file/folder tree, optionally rooted at a path |
| `read_file(path)` | Returns the raw content of a specific source file |

### 8.3 MCP Authorization and Scoping

**The problem**: External AI clients (Claude Desktop, Cursor) connect to the MCP server without a browser session. They must be authorized and scoped to a specific repository.

**Solution: Scoped API tokens**

1. Users generate a repository-scoped token from the management UI.
2. The token (a random 32-byte hex string) is stored as a SHA-256 hash in the `mcp_tokens` table, linked to a `repositoryId`.
3. The external client passes the token as a Bearer header in the MCP SSE connection request.
4. A Hono middleware on the `/api/mcp` route validates the token hash, retrieves the associated `repositoryId`, and injects it into the request context.
5. All MCP tool implementations receive the `repositoryId` from context — they cannot query outside that scope.

```typescript
// apps/api/src/middleware/mcp-auth.ts

export const mcpAuthMiddleware = createMiddleware(async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const tokenHash = sha256(token)
  const record = await db.query.mcpTokens.findFirst({
    where: eq(mcpTokens.tokenHash, tokenHash),
  })
  if (!record) return c.json({ error: 'Invalid token' }, 401)

  await db.update(mcpTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(mcpTokens.id, record.id))

  c.set('repositoryId', record.repositoryId)
  await next()
})
```

### 8.4 Claude Desktop / Cursor Configuration Example

Users copy the generated connection config from the UI:

```json
{
  "mcpServers": {
    "example-my-repo": {
      "url": "https://your-instance.com/api/mcp",
      "headers": {
        "Authorization": "Bearer jdw_<token>"
      }
    }
  }
}
```

---

## 9. Notification System

### 9.1 Approach
Job progress is surfaced to the frontend via Server-Sent Events (SSE), consistent with the MCP transport mechanism already in use. This avoids the stateful complexity of WebSockets and requires no additional libraries.

### 9.2 Flow

```
Worker (BullMQ)
  └─► job.updateProgress(n)
        └─► BullMQ emits 'progress' event on Redis pub/sub channel
              └─► API subscribes to channel for active SSE connections
                    └─► Pushes event to browser via SSE stream
```

### 9.3 SSE Endpoint

```typescript
// apps/api/src/routes/notifications.ts

app.get('/notifications/jobs/:jobId', async (c) => {
  const { jobId } = c.req.param()
  const userId = c.get('userId')  // from auth middleware

  return streamSSE(c, async (stream) => {
    const queueEvents = new QueueEvents('repository', { connection: redisConnection })

    queueEvents.on('progress', async ({ jobId: id, data }) => {
      if (id !== jobId) return
      await stream.writeSSE({
        event: 'progress',
        data: JSON.stringify({ jobId, progress: data }),
      })
    })

    queueEvents.on('completed', async ({ jobId: id }) => {
      if (id !== jobId) return
      await stream.writeSSE({ event: 'completed', data: JSON.stringify({ jobId }) })
      stream.close()
    })

    queueEvents.on('failed', async ({ jobId: id, failedReason }) => {
      if (id !== jobId) return
      await stream.writeSSE({
        event: 'failed',
        data: JSON.stringify({ jobId, reason: failedReason }),
      })
      stream.close()
    })
  })
})
```

### 9.4 Horizontal Scaling Consideration
BullMQ's `QueueEvents` subscribes to Redis pub/sub internally. Because the event bus is Redis (not in-process), multiple API instances all receive the same job events — SSE notifications work correctly across horizontally scaled API nodes without sticky sessions.

---

## 10. Caching (`packages/config` — Redis via `ioredis`)

### 10.1 Distributed Cache
Redis replaces the previous in-memory `MemoryCacheAdapter`. All API nodes share the same cache state, making horizontal scaling safe.

**Cached resources:**
- Repository structure trees (TTL: 10 minutes, invalidated on incremental update)
- User session data (TTL: matches JWT expiry)
- Rendered mind map JSON (TTL: 1 hour)
- Search result sets for repeated queries (TTL: 5 minutes)

### 10.2 Cache Interface
A thin wrapper provides a consistent interface and keeps `ioredis` as an implementation detail:

```typescript
// packages/config/src/cache.ts

export interface ICache {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>
  del(key: string): Promise<void>
  withLock<T>(key: string, fn: () => Promise<T>): Promise<T>
}
```

`withLock` uses Redlock (distributed mutex via `redlock` package) for operations that must not run concurrently across nodes (e.g., triggering an incremental update while one is already in progress).

---

## 11. Frontend (`apps/web` — Next.js 15)

### 11.1 Tech Stack
Unchanged from functional requirements:
- **Framework**: Next.js 15 (App Router).
- **UI**: React 19, Tailwind CSS, Radix UI (via Shadcn/UI).
- **Documentation**: `fumadocs-ui` for polished documentation rendering.
- **Internationalization**: `next-intl` for multi-language support.

### 11.2 Type-Safe API Client
Because `packages/types` is shared across the monorepo, the API client achieves end-to-end type safety without code generation:

```typescript
// packages/types/src/api.ts
import { z } from 'zod'

export const RepositorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(['pending', 'processing', 'ready', 'failed']),
  cloneUrl: z.string().url(),
})

export type Repository = z.infer<typeof RepositorySchema>
```

The Hono API validates inbound payloads with the same Zod schema. The frontend imports the same `Repository` type — both sides always agree.

### 11.3 Job Progress UI
The frontend subscribes to the SSE notification endpoint after triggering a repository analysis:

```typescript
const eventSource = new EventSource(`/api/notifications/jobs/${jobId}`)
eventSource.addEventListener('progress', (e) => {
  const { progress } = JSON.parse(e.data)
  setProgress(progress)  // drives a progress bar
})
eventSource.addEventListener('completed', () => {
  setStatus('ready')
  eventSource.close()
})
```

---

## 12. Security and Configuration

### 12.1 Environment Management
- All environment variables are declared and validated at startup using `t3-env` (Zod-based env validation).
- Invalid or missing variables cause a hard crash at boot — no silent misconfiguration in production.
- Variables are grouped by app (`DATABASE_URL`, `REDIS_URL`, `AI_PROVIDER`, `AUTH_SECRET`, etc.).

### 12.2 Secrets Handling
- AI provider API keys, OAuth client secrets, and JWT signing secrets are injected via environment variables.
- MCP tokens are never stored in plaintext — only SHA-256 hashes are persisted.
- `better-auth` handles session signing internally using `AUTH_SECRET`.

### 12.3 Input Validation
All API endpoints validate request bodies via Zod schemas before any business logic executes. The `@hono/zod-validator` middleware returns structured 400 errors on validation failure.

---

## 13. Deployment and Infrastructure

### 13.1 Local Development
`compose.yaml` provides the full backing services stack:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16   # includes pgvector extension
    environment:
      POSTGRES_DB: convergekit_dev
      POSTGRES_PASSWORD: dev
    ports: ["5432:5432"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
```

`turbo dev` starts all three apps (web, api, worker) concurrently with shared environment variables.

### 13.2 Containerization
Each app has its own `Dockerfile`. The worker image is identical in base to the API image — same Node.js runtime, same `packages/` dependencies — but its entrypoint runs the worker process, not the HTTP server.

### 13.3 Repository Workspace Storage
- **Local / Single-node**: Repositories are cloned to an ephemeral local directory (e.g., `/tmp/convergekit-workspaces/<repoId>`), analyzed, and deleted after indexing.
- **Multi-node / Production**: A shared volume (NFS, EFS) or object storage (S3-compatible) mount is required so all worker nodes access the same workspace path. The workspace path is configurable via `WORKSPACE_DIR` environment variable.

### 13.4 MCP SSE Scalability
BullMQ's `QueueEvents` (used in the notification SSE endpoint) subscribes via Redis pub/sub, making SSE delivery stateless across API nodes. For the MCP SSE connection itself, load balancer sticky sessions (`ip_hash` in nginx, `sessionAffinity` in Kubernetes) are required since SSE is a long-lived connection. This is standard and well-supported at all major infrastructure providers.

For deployments that cannot support sticky sessions, the MCP transport can be switched to `stdio` for local tool integrations (Claude Desktop running locally), which removes the network statefulness concern entirely.

### 13.5 CI/CD
- **GitHub Actions**: Docker image build and push on merge to `main`.
- **Turbo Remote Cache**: Build artifacts are cached remotely (Vercel or self-hosted) to accelerate CI pipelines.
- **Database Migrations**: `drizzle-kit migrate` runs as a pre-deploy step, applied before the new API version receives traffic.

---

## 14. Technology Reference

| Concern | Technology | Replaces |
|---|---|---|
| Backend API | Hono | ASP.NET Core Minimal APIs |
| ORM | Drizzle ORM | Entity Framework Core |
| Background Jobs | BullMQ | `IHostedService` |
| Job Queue Backing Store | Redis | — (new) |
| Distributed Cache | Redis (`ioredis`) | `MemoryCacheAdapter` (in-memory) |
| AI SDK (chat) | Vercel AI SDK | Microsoft.Extensions.AI |
| AI SDK (embeddings) | Voyage AI `voyage-code-3` | Microsoft.Extensions.AI |
| Code chunking | `tree-sitter` (AST-aware) | — (was unspecified) |
| MCP | `@modelcontextprotocol/sdk` | ModelContextProtocol (NuGet) |
| Auth | better-auth | Manual JWT + OAuth2 |
| Search (Phase 1) | PostgreSQL `tsvector` + GIN on `chunks` | — (was unspecified) |
| Search (Phase 2) | `pgvector` HNSW + `voyage-code-3` 1024-dim | — (was unspecified) |
| Search weighting | Dynamic query classifier | Fixed 30/70 split |
| Logging | Pino | Serilog |
| Env Validation | t3-env (Zod) | — (was unspecified) |
| Monorepo | Turborepo | — (was unspecified) |
| Frontend | Next.js 15 ✓ | — (unchanged) |
| Database | PostgreSQL / SQLite ✓ | — (unchanged) |
| Containerization | Docker + compose.yaml ✓ | — (unchanged) |
| CI/CD | GitHub Actions ✓ | — (unchanged) |
