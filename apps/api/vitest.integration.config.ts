import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/*.integration.test.ts'],
    // Several of these tests take a table-level lock on the real, shared "user"
    // table (bulk mutations' `SELECT ... FOR UPDATE`, the backfill's
    // `LOCK TABLE "user" IN EXCLUSIVE MODE`) and assert exact pg_locks wait
    // state. Running test FILES in parallel workers would let one file's
    // table-level lock stall (and, for ambient-cohort snapshots, race) an
    // unrelated file's assertions against the same live database. Serializing
    // files removes that cross-file interference entirely; tests within a
    // single file already run sequentially by default.
    fileParallelism: false,
  },
})
