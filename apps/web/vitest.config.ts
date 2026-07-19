import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: [
        'src/app/api/**/*.ts',
        'src/components/**/*.ts',
        'src/i18n/**/*.ts',
        'src/lib/**/*.ts',
        'src/middleware.ts',
      ],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**', 'src/test/**'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 64,
        lines: 72,
      },
    },
  },
})
