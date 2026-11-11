import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../errors.js'
import type { FactoryAccess } from '../lib/factory-access.js'
import { createFactoryRoutes, type FactoryRouteDeps } from './factory.js'

vi.mock('@convergekit/db', () => ({ db: {}, account: {}, factoryUserState: {} }))

const member: FactoryAccess = { member: true, login: 'pat-owner', reason: null }
const stranger: FactoryAccess = { member: false, login: 'someone', reason: 'not_collaborator' }

let access: FactoryAccess
let deps: FactoryRouteDeps

function app() {
  const root = new Hono()
  root.use('*', async (c, next) => {
    c.set('userId', 'u1')
    return next()
  })
  root.route('/factory', createFactoryRoutes(deps))
  root.onError((err, c) =>
    err instanceof AppError
      ? c.json({ error: err.message }, err.statusCode as 403)
      : c.json({ error: String(err) }, 500),
  )
  return root
}

beforeEach(() => {
  access = member
  deps = {
    config: {
      enabled: true,
      hubRepo: 'acme/factory-hub',
      accessRepo: 'acme/factory-hub',
      githubToken: 'ghp_service',
      webhookSecret: null,
      board: null,
      memberSignup: false,
    },
    resolveAccess: vi.fn(async () => access),
    loadHub: vi.fn(async () => ({
      hubRepo: 'acme/factory-hub',
      repos: [
        { fullName: 'acme/factory-hub', profile: null },
        {
          fullName: 'acme/storefront',
          profile: {
            repo: 'acme/storefront',
            product: 'Acme Shop',
            app: null,
            integrationBranch: 'develop',
            productionBranch: 'main',
            stagingSite: null,
            people: {
              productOwners: ['pat-owner'],
              qa: [],
              developers: [],
              reviewAccounts: [],
              umbrellaApprovals: 1,
            },
            sections: { Secret: { Token: 'do not leak sections' } },
          },
        },
      ],
    })),
    getUserState: vi.fn(async () => ({ onboardedAt: null })),
    setOnboarded: vi.fn(async (_u: string, _l: string, onboarded: boolean) => ({
      onboardedAt: onboarded ? new Date('2026-11-11T10:00:00Z') : null,
    })),
  }
})

describe('GET /factory/me', () => {
  it('tells a member who they are and where onboarding stands', async () => {
    const res = await app().request('/factory/me')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      member: true,
      login: 'pat-owner',
      reason: null,
      accessRepo: 'acme/factory-hub',
      hubRepo: 'acme/factory-hub',
      board: null,
      onboardedAt: null,
    })
  })

  it('tells a non-member they are not on the team, without hub details', async () => {
    access = stranger
    const res = await app().request('/factory/me')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      member: false,
      login: 'someone',
      reason: 'not_collaborator',
      accessRepo: 'acme/factory-hub',
    })
    expect(deps.getUserState).not.toHaveBeenCalled()
  })
})

describe('PUT /factory/me', () => {
  it('records onboarding for a member', async () => {
    const res = await app().request('/factory/me', {
      method: 'PUT',
      body: JSON.stringify({ onboarded: true }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ onboardedAt: '2026-11-11T10:00:00.000Z' })
    expect(deps.setOnboarded).toHaveBeenCalledWith('u1', 'pat-owner', true)
  })

  it('refuses a non-member', async () => {
    access = stranger
    const res = await app().request('/factory/me', {
      method: 'PUT',
      body: JSON.stringify({ onboarded: true }),
    })
    expect(res.status).toBe(403)
    expect(deps.setOnboarded).not.toHaveBeenCalled()
  })
})

describe('GET /factory/hub', () => {
  it('returns repos and profile summaries to members, without raw sections', async () => {
    const res = await app().request('/factory/hub')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { repos: { fullName: string; profile: unknown }[] }
    expect(body.repos.map((repo) => repo.fullName)).toEqual(['acme/factory-hub', 'acme/storefront'])
    expect(JSON.stringify(body)).not.toContain('do not leak sections')
  })

  it('refuses a non-member', async () => {
    access = stranger
    expect((await app().request('/factory/hub')).status).toBe(403)
    expect(deps.loadHub).not.toHaveBeenCalled()
  })
})
