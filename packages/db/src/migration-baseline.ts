import type postgres from 'postgres'

export const productionBaselineManualMigrations = [
  '0002_tsvector_trigger.sql',
  '0003_hnsw_index.sql',
  '0004_wiki_pages.sql',
  '0005_user_ai_settings.sql',
  '0006_nomic_embed_768.sql',
  '0007_nomic_embed_code_3584.sql',
  '0008_lmstudio_model_config.sql',
  '0009_openrouter_model_config.sql',
  '0010_settings_model_columns.sql',
  '0011_wiki_pages_source_files.sql',
  '0012_branch_embedding_profiles.sql',
  '0013_user_roles_and_groups.sql',
  '0014_user_invitations.sql',
] as const

type MigrationSql = postgres.Sql

type ExistsRow = {
  exists: boolean
}

type BaselineRequirement =
  | { kind: 'table'; table: string; label: string }
  | { kind: 'column'; table: string; column: string; label: string }
  | { kind: 'trigger'; trigger: string; label: string }
  | { kind: 'enum'; enumName: string; label: string }

export const productionBaselineRequirements: readonly BaselineRequirement[] = [
  {
    kind: 'trigger',
    trigger: 'chunks_search_vector_update',
    label: '0002_tsvector_trigger.sql: chunks_search_vector_update trigger',
  },
  { kind: 'table', table: 'wiki_pages', label: '0004_wiki_pages.sql: wiki_pages table' },
  {
    kind: 'table',
    table: 'user_ai_settings',
    label: '0005_user_ai_settings.sql: user_ai_settings table',
  },
  {
    kind: 'column',
    table: 'user_ai_settings',
    column: 'lm_studio_chat_model',
    label: '0008_lmstudio_model_config.sql: user_ai_settings.lm_studio_chat_model',
  },
  {
    kind: 'column',
    table: 'user_ai_settings',
    column: 'openrouter_chat_model',
    label: '0009_openrouter_model_config.sql: user_ai_settings.openrouter_chat_model',
  },
  {
    kind: 'column',
    table: 'user_ai_settings',
    column: 'openai_endpoint',
    label: '0010_settings_model_columns.sql: user_ai_settings.openai_endpoint',
  },
  {
    kind: 'column',
    table: 'wiki_pages',
    column: 'source_files',
    label: '0011_wiki_pages_source_files.sql: wiki_pages.source_files',
  },
  {
    kind: 'column',
    table: 'branches',
    column: 'embedding_provider',
    label: '0012_branch_embedding_profiles.sql: branches.embedding_provider',
  },
  {
    kind: 'column',
    table: 'branches',
    column: 'embedding_dimensions',
    label: '0012_branch_embedding_profiles.sql: branches.embedding_dimensions',
  },
  { kind: 'enum', enumName: 'user_role', label: '0013_user_roles_and_groups.sql: user_role enum' },
  { kind: 'table', table: 'groups', label: '0013_user_roles_and_groups.sql: groups table' },
  {
    kind: 'table',
    table: 'group_repositories',
    label: '0013_user_roles_and_groups.sql: group_repositories table',
  },
  {
    kind: 'column',
    table: 'user',
    column: 'role',
    label: '0013_user_roles_and_groups.sql: user.role',
  },
  {
    kind: 'column',
    table: 'user',
    column: 'group_id',
    label: '0013_user_roles_and_groups.sql: user.group_id',
  },
  {
    kind: 'table',
    table: 'user_invitations',
    label: '0014_user_invitations.sql: user_invitations table',
  },
]

export function formatProductionBaselineFailure(missing: readonly string[]): string {
  const missingLines = missing.map((item) => `- ${item}`).join('\n')

  return [
    'Production baseline schema is incomplete; refusing to apply MCP token hardening migration.',
    'This release expects historical manual migrations 0002_tsvector_trigger.sql through 0014_user_invitations.sql to already be present.',
    'Missing baseline objects:',
    missingLines,
    'Run `pnpm --filter @convergekit/db db:validate:baseline` against the target database, then restore or upgrade the baseline before deploying 0015_mcp_token_hardening.sql.',
  ].join('\n')
}

export async function listMissingProductionBaselineObjects(sql: MigrationSql): Promise<string[]> {
  const missing: string[] = []

  for (const requirement of productionBaselineRequirements) {
    const exists = await baselineRequirementExists(sql, requirement)
    if (!exists) {
      missing.push(requirement.label)
    }
  }

  return missing
}

export async function verifyProductionMigrationBaseline(sql: MigrationSql): Promise<void> {
  const missing = await listMissingProductionBaselineObjects(sql)

  if (missing.length > 0) {
    throw new Error(formatProductionBaselineFailure(missing))
  }
}

export async function markVerifiedBaselineMigrations(sql: MigrationSql): Promise<void> {
  for (const filename of productionBaselineManualMigrations) {
    await sql`
      INSERT INTO "manual_migrations" ("filename")
      VALUES (${filename})
      ON CONFLICT ("filename") DO NOTHING
    `
  }
}

async function baselineRequirementExists(
  sql: MigrationSql,
  requirement: BaselineRequirement,
): Promise<boolean> {
  switch (requirement.kind) {
    case 'table':
      return tableExists(sql, requirement.table)
    case 'column':
      return columnExists(sql, requirement.table, requirement.column)
    case 'trigger':
      return triggerExists(sql, requirement.trigger)
    case 'enum':
      return enumExists(sql, requirement.enumName)
  }
}

async function tableExists(sql: MigrationSql, table: string): Promise<boolean> {
  const rows = await sql<ExistsRow[]>`
    SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS "exists"
  `

  return rows[0]?.exists === true
}

async function columnExists(sql: MigrationSql, table: string, column: string): Promise<boolean> {
  const rows = await sql<ExistsRow[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${table}
        AND column_name = ${column}
    ) AS "exists"
  `

  return rows[0]?.exists === true
}

async function triggerExists(sql: MigrationSql, trigger: string): Promise<boolean> {
  const rows = await sql<ExistsRow[]>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = ${trigger}
        AND NOT tgisinternal
    ) AS "exists"
  `

  return rows[0]?.exists === true
}

async function enumExists(sql: MigrationSql, enumName: string): Promise<boolean> {
  const rows = await sql<ExistsRow[]>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_type
      WHERE typname = ${enumName}
        AND typtype = 'e'
    ) AS "exists"
  `

  return rows[0]?.exists === true
}
