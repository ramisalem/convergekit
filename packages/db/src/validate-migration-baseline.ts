import postgres from 'postgres'
import {
  formatProductionBaselineFailure,
  listMissingProductionBaselineObjects,
} from './migration-baseline.js'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for migration baseline validation')
}

const sql = postgres(databaseUrl, { max: 1, prepare: false })

try {
  const missing = await listMissingProductionBaselineObjects(sql)

  if (missing.length > 0) {
    console.error(formatProductionBaselineFailure(missing))
    process.exitCode = 1
  } else {
    const tokenCountRows = await sql<{ count: number }[]>`
      SELECT count(*)::int AS "count"
      FROM "mcp_tokens"
    `
    const tokenCount = tokenCountRows[0]?.count ?? 0

    console.log('Production migration baseline is ready.')
    console.log(`Existing MCP tokens that 0015 will force-rotate: ${tokenCount}`)
  }
} finally {
  await sql.end()
}
