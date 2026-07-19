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
        statements: 44,
        branches: 37,
        functions: 37,
        lines: 43,
      },
    },
  },
})
