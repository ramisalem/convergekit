import { z } from 'zod'

// ─── Repository ────────────────────────────────────────────────────────────────

export const createRepositorySchema = z.object({
  name: z.string().min(1).max(255),
  cloneUrl: z.string().url(),
  provider: z.enum(['github', 'gitlab', 'bitbucket']),
  defaultBranch: z.string().min(1).default('main'),
  isPrivate: z.boolean().default(false),
  accessToken: z.string().min(1).optional(),
})

export type CreateRepositoryInput = z.infer<typeof createRepositorySchema>

export const embeddingProfileSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'openrouter', 'lmstudio']),
  model: z.string(),
  dimensions: z.number().int().positive(),
  endpoint: z.string().nullable(),
  capturedAt: z.string().datetime().nullable(),
})

export const embeddingCompatibilitySchema = z.object({
  compatible: z.boolean(),
  message: z.string().nullable(),
})

export const repositoryResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  cloneUrl: z.string(),
  provider: z.enum(['github', 'gitlab', 'bitbucket']),
  defaultBranch: z.string(),
  isPrivate: z.boolean(),
  status: z.enum(['pending', 'processing', 'done', 'failed']),
  userId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  indexedAt: z.string().datetime().nullable().optional(),
  listSummary: z.object({
    primaryLanguage: z.string().nullable(),
    loc: z.number().int().nonnegative().nullable(),
    chatCount: z.number().int().nonnegative(),
    indexedAt: z.string().datetime().nullable(),
  }).optional(),
  embeddingProfile: embeddingProfileSchema.nullable().optional(),
  embeddingCompatibility: embeddingCompatibilitySchema.nullable().optional(),
})

export type RepositoryResponse = z.infer<typeof repositoryResponseSchema>

export const retrievalIntentSchema = z.enum([
  'current_code',
  'operational',
  'api_schema',
  'troubleshooting',
  'historical',
])

export type RetrievalIntent = z.infer<typeof retrievalIntentSchema>

export const evidenceTierSchema = z.enum(['A', 'B', 'C', 'D'])
export const evidenceLabelSchema = z.enum(['Code', 'Tests', 'Docs', 'Design/History'])

export const repositoryGuideSummarySchema = z.object({
  repositoryId: z.string().uuid(),
  indexedAt: z.string().datetime().nullable(),
  status: z.enum(['pending', 'processing', 'done', 'failed']),
  mindMapStatus: z.enum(['pending', 'processing', 'done', 'failed']).nullable(),
  metadataStatus: z.enum(['ready', 'refreshing']),
  areaSource: z.enum(['mind_map', 'top_level_path', 'none']),
  evidenceTotals: z.array(
    z.object({
      tier: evidenceTierSchema,
      label: evidenceLabelSchema,
      fileCount: z.number().int().nonnegative(),
      chunkCount: z.number().int().nonnegative().optional(),
    }),
  ),
  areas: z.array(
    z.object({
      name: z.string(),
      confidenceLabel: z.enum([
        'Very strong',
        'Strong',
        'Mixed with docs',
        'Gated history',
        'Limited',
      ]),
      pathHint: z.string().nullable(),
      evidenceShare: z.array(
        z.object({
          tier: evidenceTierSchema,
          fileCount: z.number().int().nonnegative(),
          percentage: z.number().min(0).max(100),
        }),
      ),
      primaryQuestionIntents: z.array(retrievalIntentSchema),
    }),
  ),
  questionStarters: z.array(
    z.object({
      intent: retrievalIntentSchema,
      title: z.string(),
      evidenceLabels: z.array(evidenceLabelSchema),
      examplePrompt: z.string(),
      generatedFromArea: z.string().optional(),
    }),
  ),
  questionCards: z.array(
    z.object({
      intent: retrievalIntentSchema,
      question: z.string(),
      confidence: z.number().int().min(1).max(5),
      route: z.string(),
      primaryTier: evidenceTierSchema,
      secondaryTier: evidenceTierSchema.nullable(),
      rationale: z.string(),
      alignment: z.enum(['ok', 'stale', 'conflict']),
      generatedFromArea: z.string(),
      sources: z.array(
        z.object({
          tier: evidenceTierSchema,
          label: z.string(),
          count: z.number().int().positive(),
        }),
      ),
    }),
  ),
  skippedSummary: z.array(
    z.object({
      reason: z.enum(['unsupported-extension', 'oversized', 'generated', 'noise']),
      count: z.number().int().nonnegative(),
    }),
  ),
})

export type RepositoryGuideSummary = z.infer<typeof repositoryGuideSummarySchema>
