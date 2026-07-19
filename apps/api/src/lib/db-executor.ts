import type { db } from '@convergekit/db'

/**
 * `db` itself, or the tx handle passed to a db.transaction callback.
 *
 * Deliberately DERIVED from the live `db` instance rather than importing drizzle's
 * `PgTransaction` with hand-pinned schema/query generics: the derived form can never
 * drift from the actual client configuration. If drizzle ever exports a stable,
 * generic-free transaction type for this client, switching to it is fine.
 */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Test-only await points on the extracted transaction functions (no-ops in production). */
export type TxHooks = {
  afterLock?: () => Promise<void> // after lock acquisition, before any read/write
  beforeCommit?: () => Promise<void> // after all writes, before COMMIT
}
