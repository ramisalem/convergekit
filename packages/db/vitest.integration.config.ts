import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/*.integration.test.ts'],
    // The suite takes table-level locks on the shared "user" table and asserts
    // pg_locks state — a second file running in a parallel worker would race
    // or stall it (matches apps/api/vitest.integration.config.ts).
    fileParallelism: false,
  },
})
