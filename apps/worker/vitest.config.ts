import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 5,
        branches: 6,
        functions: 5,
        lines: 4,
      },
    },
  },
})
