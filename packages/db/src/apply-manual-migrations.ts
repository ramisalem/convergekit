import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import {
  listMissingProductionBaselineObjects,
  markVerifiedBaselineMigrations,
  productionBaselineManualMigrations,
  verifyProductionMigrationBaseline,
} from './migration-baseline.js'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for manual migrations')
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../migrations')
const sql = postgres(databaseUrl, { max: 1, prepare: false })
const shouldBootstrapLocalBaseline =
  process.env.CONVERGEKIT_LOCAL_BOOTSTRAP_MANUAL_MIGRATIONS === 'true'

const manualMigrations = [
  '0015_mcp_token_hardening.sql',
  '0016_chat_session_history.sql',
  '0017_evidence_metadata.sql',
] as const

async function applyManualMigrationFiles(filenames: readonly string[]) {
  for (const filename of filenames) {
    const applied = await sql`
      SELECT 1
      FROM "manual_migrations"
      WHERE "filename" = ${filename}
      LIMIT 1
    `

    if (applied.length > 0) {
      console.log(`Manual migration already applied: ${filename}`)
      continue
    }

    const migrationSql = await readFile(join(migrationsDir, filename), 'utf8')

    await sql.begin(async (transaction) => {
      await transaction.unsafe(migrationSql)
      await transaction.unsafe('INSERT INTO "manual_migrations" ("filename") VALUES ($1)', [
        filename,
      ])
    })

    console.log(`Manual migration applied: ${filename}`)
  }
}

try {
  await sql`
    CREATE TABLE IF NOT EXISTS "manual_migrations" (
      "filename" text PRIMARY KEY NOT NULL,
      "applied_at" timestamp DEFAULT now() NOT NULL
    )
  `

  const missingBaselineObjects = await listMissingProductionBaselineObjects(sql)
  if (missingBaselineObjects.length > 0 && shouldBootstrapLocalBaseline) {
    console.log('Bootstrapping historical manual migrations for local development')
    await applyManualMigrationFiles(productionBaselineManualMigrations)
  } else {
    await verifyProductionMigrationBaseline(sql)
    await markVerifiedBaselineMigrations(sql)
  }

  await applyManualMigrationFiles(manualMigrations)
} finally {
  await sql.end()
}
