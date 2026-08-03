import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

const optionalNonEmptyString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
)

export const env = createEnv({
  server: {
    // ─── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: z.string().url(),

    // ─── Redis ────────────────────────────────────────────────────────────────
    REDIS_URL: z.string().url(),

    // ─── AI providers ─────────────────────────────────────────────────────────
    AI_PROVIDER: z.enum(['anthropic', 'openai', 'openrouter', 'lmstudio']).default('openrouter'),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    EMBEDDING_BASE_URL: z.string().url().default('http://localhost:1234/v1'),
    EMBEDDING_MODEL: z.string().default('text-embedding-nomic-embed-code'),
    // LM Studio local server (used when AI_PROVIDER=lmstudio)
    LM_STUDIO_BASE_URL: z.string().url().default('http://localhost:1234/v1'),
    LM_STUDIO_CHAT_MODEL: z.string().default('qwen/qwen3.5-9b'),
    LM_STUDIO_MINDMAP_MODEL: z.string().default('qwen/qwen3.5-9b'),

    // ─── Auth ──────────────────────────────────────────────────────────────────
    BETTER_AUTH_SECRET: z.string().min(32),

    // GitHub OAuth
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),

    // Workforce SSO (explicitly gated by WORKFORCE_SSO_ENABLED)
    WORKFORCE_SSO_ENABLED: z.enum(['true', 'false']).default('false'),
    WORKFORCE_SSO_PROVIDER_LABEL: optionalNonEmptyString.default('Authentik'),
    WORKFORCE_SAML_IDP_SSO_URL: optionalNonEmptyString,
    WORKFORCE_SAML_IDP_ENTITY_ID: optionalNonEmptyString,
    WORKFORCE_SAML_IDP_CERT: optionalNonEmptyString,
    WORKFORCE_SAML_SP_ENTITY_ID: optionalNonEmptyString,
    WORKFORCE_SAML_ACS_URL: optionalNonEmptyString,
    WORKFORCE_SAML_START_URL: optionalNonEmptyString,
    CONVERGEKIT_SESSION_TTL_DAYS: z.coerce.number().int().positive().max(90).default(14),

    // Bootstrap: first admin account email (must match a GitHub OAuth login)
    INITIAL_ADMIN_EMAIL: z.string().email().optional(),

    // Access-request contacts shown to signed-in users with no repositories.
    ACCESS_SUPPORT_ADMIN_EMAILS: optionalNonEmptyString,

    // ─── MCP OAuth (gated by MCP_OAUTH_ENABLED; ships dark) ─────────────────────
    MCP_OAUTH_ENABLED: z.enum(['true', 'false']).default('false'),
    MCP_OAUTH_ISSUER_URL: z.string().url().optional(),

    // ─── App runtime ──────────────────────────────────────────────────────────
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(3001),

    // ─── Worker ───────────────────────────────────────────────────────────────
    WORKSPACE_DIR: z.string().default('/tmp/convergekit-workspace'),
  },
  runtimeEnv: process.env,
  onValidationError(error) {
    console.error('❌ Invalid environment variables:', error)
    process.exit(1)
  },
})

export type Env = typeof env
