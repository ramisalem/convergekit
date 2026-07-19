import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  dbSelectLimit: vi.fn(),
}))

vi.mock('@bull-board/api', () => ({
  createBullBoard: vi.fn(() => undefined),
}))

vi.mock('@bull-board/api/bullMQAdapter', () => ({
  BullMQAdapter: vi.fn(),
}))

vi.mock('@bull-board/hono', () => ({
  HonoAdapter: vi.fn().mockImplementation(function HonoAdapter() {
    return {
      setBasePath: vi.fn(),
      registerPlugin: vi.fn(() => ({ routes: [] })),
    }
  }),
}))

vi.mock('@hono/node-server/serve-static', () => ({
  serveStatic: vi.fn(),
}))

vi.mock('@convergekit/queues', () => ({
  QUEUE_NAMES: {
    REPOSITORY_ANALYSIS: 'repository-analysis',
    INCREMENTAL_UPDATE: 'incremental-update',
    TRANSLATION: 'translation',
    MIND_MAP: 'mind-map',
    WIKI_GENERATION: 'wiki-generation',
  },
  repositoryQueue: {},
  incrementalQueue: {},
  translationQueue: {},
  mindMapQueue: {},
  wikiGenerationQueue: {},
}))

vi.mock('@convergekit/auth', () => ({
  auth: {
    api: {
      getSession: mocks.getSession,
    },
    handler: vi.fn(() => new Response(null, { status: 200 })),
  },
}))

vi.mock('@convergekit/db', () => ({
  account: {
    userId: 'account.userId',
    providerId: 'account.providerId',
  },
  db: {
    query: {
      account: {
        findFirst: vi.fn().mockResolvedValue({ accessToken: 'gho_admin' }),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((selector: unknown) => {
          if (selector === 'admin') {
            return Promise.resolve([{ name: 'Test User', email: 'test@example.com' }])
          }

          return {
            limit: mocks.dbSelectLimit.mockImplementation(async () => {
              if (selector === 'test-user') {
                return [
                  {
                    id: 'test-user',
                    name: 'Test User',
                    email: 'test@example.com',
                    image: null,
                    role: 'admin',
                    groupId: null,
                    deactivatedAt: null,
                  },
                ]
              }

              return []
            }),
          }
        }),
      })),
    })),
  },
  user: {
    id: 'id',
    name: 'name',
    email: 'email',
    image: 'image',
    role: 'role',
    groupId: 'groupId',
    deactivatedAt: 'deactivatedAt',
  },
  // ci-token-service.ts builds its ciTokenColumns select map from these at
  // module-eval time, so the mock must define them (values are never queried here).
  mcpTokens: {
    id: 'mcpTokens.id',
    label: 'mcpTokens.label',
    fingerprint: 'mcpTokens.fingerprint',
    scopes: 'mcpTokens.scopes',
    expiresAt: 'mcpTokens.expiresAt',
    revokedAt: 'mcpTokens.revokedAt',
    revokedReason: 'mcpTokens.revokedReason',
    lastUsedAt: 'mcpTokens.lastUsedAt',
    lastUsedIp: 'mcpTokens.lastUsedIp',
    lastUsedUserAgent: 'mcpTokens.lastUsedUserAgent',
    lastUsedClientName: 'mcpTokens.lastUsedClientName',
    lastUsedToolName: 'mcpTokens.lastUsedToolName',
    createdAt: 'mcpTokens.createdAt',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: (_column: unknown, value: unknown) => value,
  and: (...values: unknown[]) => values.find(Boolean),
  isNull: () => true,
}))

vi.mock('./lib/github-access.js', () => ({
  verifyGitHubOrganizationAccess: vi.fn().mockResolvedValue({ allowed: true, reason: null }),
}))

import { createApp } from './app.js'

describe('createApp auth routing', () => {
  beforeEach(() => {
    mocks.getSession.mockResolvedValue({ user: { id: 'test-user' } })
    mocks.dbSelectLimit.mockReset()
  })

  it('treats GET /api/me as an authenticated route', async () => {
    const app = createApp()

    const res = await app.request('/api/me')

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      user: {
        id: 'test-user',
        name: 'Test User',
        email: 'test@example.com',
        image: null,
        role: 'admin',
        groupId: null,
        deactivatedAt: null,
      },
      supportContacts: [{ name: 'Test User', email: 'test@example.com' }],
    })
  })
})
