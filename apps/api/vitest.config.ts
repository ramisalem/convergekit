import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 33,
        branches: 29,
        functions: 31,
        lines: 34,
      },
    },
  },
})
