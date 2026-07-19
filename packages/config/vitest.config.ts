import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 86,
        branches: 85,
        functions: 86,
        lines: 88,
      },
    },
  },
})
