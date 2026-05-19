import { and, eq, isNull } from 'drizzle-orm'
import { closeDbConnection, db } from './client.js'
import { extractLinkedCodePaths } from './evidence-alignment.js'
import { classifyRepositoryFile } from './evidence.js'
import { documents } from './schema.js'

async function main() {
  const rows = await db
    .select({
      id: documents.id,
      path: documents.path,
      content: documents.content,
      evidenceTier: documents.evidenceTier,
    })
    .from(documents)
    .where(isNull(documents.evidenceTier))

  let updated = 0
  let skipped = 0

  for (const row of rows) {
    const sizeBytes = Buffer.byteLength(row.content, 'utf8')
    const decision = classifyRepositoryFile(row.path, sizeBytes)
    if (!decision.index) {
      skipped++
      continue
    }

    const linkedCodePaths = decision.evidenceTier === 'D' ? extractLinkedCodePaths(row.content) : []

    await db
      .update(documents)
      .set({
        evidenceTier: decision.evidenceTier,
        evidenceKind: decision.evidenceKind,
        searchByDefault: decision.searchByDefault,
        indexDecisionReason: `backfill:${decision.indexDecisionReason}`,
        evidenceAlignmentStatus: 'unverified',
        linkedCodePaths,
        linkedCodeContentHashes: {},
        updatedAt: new Date(),
      })
      .where(and(eq(documents.id, row.id), isNull(documents.evidenceTier)))

    updated++
  }

  console.log(`Evidence metadata backfill complete: updated=${updated} skipped=${skipped}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDbConnection()
  })
