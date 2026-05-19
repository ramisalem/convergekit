import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  dbSelectLimit: vi.fn(),
  accountFindFirst: vi.fn(),
  verifyGitHubOrganizationAccess: vi.fn(),
  next: vi.fn(),
}))

vi.mock('@convergekit/auth', () => ({
  auth: {
    api: {
      getSession: mocks.getSession,
    },
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
        findFirst: mocks.accountFindFirst,
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: mocks.dbSelectLimit,
        })),
      })),
    })),
  },
  user: {
    id: 'user.id',
    email: 'user.email',
    role: 'user.role',
    deactivatedAt: 'user.deactivatedAt',
  },
}))

vi.mock('@convergekit/config/access-policy', () => ({
  accessPolicyConfig: {
    allowedEmailDomain: 'example.com',
    allowedGitHubOrg: 'example-org',
    allowedRepositoryHost: 'github.com',
  },
  isAllowedAccessPolicyEmail: (
    email: string,
    config: { allowedEmailDomain: string | null },
  ) => {
    if (!config.allowedEmailDomain) return true
    const normalized = email.trim().toLowerCase()
    const at = normalized.lastIndexOf('@')
    return at > 0 && normalized.slice(at + 1) === config.allowedEmailDomain
  },
  normalizeAccessPolicyEmail: (email: string) => email.trim().toLowerCase(),
}))

vi.mock('drizzle-orm', () => ({
  and: (...values: unknown[]) => values,
  eq: (_column: unknown, value: unknown) => value,
  isNull: () => true,
}))

vi.mock('../lib/github-access.js', () => ({
  verifyGitHubOrganizationAccess: mocks.verifyGitHubOrganizationAccess,
}))

import { requireAuth } from './require-auth.js'

function createContext() {
  const values = new Map<string, unknown>()
  return {
    req: { raw: { headers: new Headers() } },
    set: (key: string, value: unknown) => values.set(key, value),
    getValue: (key: string) => values.get(key),
  }
}

describe('requireAuth access policy', () => {
  beforeEach(() => {
    mocks.getSession.mockReset()
    mocks.dbSelectLimit.mockReset()
    mocks.accountFindFirst.mockReset()
    mocks.verifyGitHubOrganizationAccess.mockReset()
    mocks.next.mockReset()
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('rejects existing sessions for users outside the configured email domain', async () => {
    mocks.dbSelectLimit.mockResolvedValue([
      { id: 'user-1', email: 'person@other.test', role: 'user', deactivatedAt: null },
    ])

    await expect(requireAuth(createContext() as never, mocks.next)).rejects.toThrow(
      /configured email domain/i,
    )
    expect(mocks.next).not.toHaveBeenCalled()
  })

  it('rejects admin sessions without a linked GitHub token', async () => {
    mocks.dbSelectLimit.mockResolvedValue([
      { id: 'admin-1', email: 'admin@example.com', role: 'admin', deactivatedAt: null },
    ])
    mocks.accountFindFirst.mockResolvedValue(null)

    await expect(requireAuth(createContext() as never, mocks.next)).rejects.toThrow(
      /reconnect github/i,
    )
    expect(mocks.next).not.toHaveBeenCalled()
  })

  it('rejects admin sessions when GitHub org access is not active', async () => {
    mocks.dbSelectLimit.mockResolvedValue([
      { id: 'admin-1', email: 'admin@example.com', role: 'admin', deactivatedAt: null },
    ])
    mocks.accountFindFirst.mockResolvedValue({ accessToken: 'gho_token' })
    mocks.verifyGitHubOrganizationAccess.mockResolvedValue({
      allowed: false,
      reason: 'sso_required',
    })

    await expect(requireAuth(createContext() as never, mocks.next)).rejects.toThrow(
      /authorize github/i,
    )
    expect(mocks.next).not.toHaveBeenCalled()
  })

  it('allows configured-domain users and stores userId in context', async () => {
    const context = createContext()
    mocks.dbSelectLimit.mockResolvedValue([
      { id: 'user-1', email: 'person@example.com', role: 'user', deactivatedAt: null },
    ])

    await requireAuth(context as never, mocks.next)

    expect(context.getValue('userId')).toBe('user-1')
    expect(mocks.next).toHaveBeenCalledTimes(1)
  })
})
