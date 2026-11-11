import type { FactoryConfig } from '@convergekit/config/factory'
import { account, db, factoryUserState } from '@convergekit/db'
import { createFactoryGitHub, loadHub, type FactoryHub } from '@convergekit/factory/github'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { Redis } from 'ioredis'
import { z } from 'zod'
import { ForbiddenError } from '../errors.js'
import {
  resolveFactoryAccess,
  type FactoryAccess,
  type FactoryCache,
} from '../lib/factory-access.js'
import { logger } from '../logger.js'

export const HUB_TTL_SECONDS = 5 * 60

type EnabledFactoryConfig = Extract<FactoryConfig, { enabled: true }>

export type FactoryUserStateRow = { onboardedAt: Date | null }

export type FactoryRouteDeps = {
  config: EnabledFactoryConfig
  resolveAccess(userId: string): Promise<FactoryAccess>
  loadHub(): Promise<FactoryHub>
  getUserState(userId: string): Promise<FactoryUserStateRow | null>
  setOnboarded(userId: string, login: string, onboarded: boolean): Promise<FactoryUserStateRow>
}

declare module 'hono' {
  interface ContextVariableMap {
    factoryAccess: FactoryAccess
  }
}

const putMeSchema = z.object({ onboarded: z.boolean() })

/**
 * /api/factory — read-only Factory module. Mounted only when FACTORY_ENABLED=true, behind
 * requireAuth (which sets userId).
 *
 * GET  /me   who you are to the factory: member or not, and your onboarding state
 * PUT  /me   members only: mark onboarding done or not done
 * GET  /hub  members only: the hub's repos and their profiles
 */
export function createFactoryRoutes(deps: FactoryRouteDeps) {
  const routes = new Hono()

  routes.use('*', async (c, next) => {
    c.set('factoryAccess', await deps.resolveAccess(c.get('userId')))
    return next()
  })

  const requireMember = (access: FactoryAccess) => {
    if (!access.member) throw new ForbiddenError('Not a member of the factory team')
    return access
  }

  routes.get('/me', async (c) => {
    const access = c.get('factoryAccess')
    if (!access.member) {
      return c.json({
        member: false as const,
        login: access.login,
        reason: access.reason,
        accessRepo: deps.config.accessRepo,
      })
    }

    const state = await deps.getUserState(c.get('userId'))
    return c.json({
      member: true as const,
      login: access.login,
      reason: null,
      accessRepo: deps.config.accessRepo,
      hubRepo: deps.config.hubRepo,
      board: deps.config.board,
      onboardedAt: state?.onboardedAt?.toISOString() ?? null,
    })
  })

  routes.put('/me', async (c) => {
    const access = requireMember(c.get('factoryAccess'))
    const body = putMeSchema.parse(await c.req.json())
    const state = await deps.setOnboarded(c.get('userId'), access.login, body.onboarded)
    return c.json({ onboardedAt: state.onboardedAt?.toISOString() ?? null })
  })

  routes.get('/hub', async (c) => {
    requireMember(c.get('factoryAccess'))
    const hub = await deps.loadHub()
    return c.json({
      hubRepo: hub.hubRepo,
      repos: hub.repos.map(({ fullName, profile }) => ({
        fullName,
        profile: profile && {
          product: profile.product,
          app: profile.app,
          integrationBranch: profile.integrationBranch,
          productionBranch: profile.productionBranch,
          stagingSite: profile.stagingSite,
          people: profile.people,
        },
      })),
    })
  })

  return routes
}

// ─── Production wiring ────────────────────────────────────────────────────────

let redis: Redis | null = null

function redisCache(): FactoryCache {
  redis ??= process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : new Redis()
  return {
    get: (key) => redis!.get(key),
    set: async (key, value, ttlSeconds) => {
      await redis!.set(key, value, 'EX', ttlSeconds)
    },
  }
}

export function createDefaultFactoryRouteDeps(config: EnabledFactoryConfig): FactoryRouteDeps {
  const github = createFactoryGitHub({ token: config.githubToken })
  const hubCacheKey = `factory:hub:v1:${config.hubRepo.toLowerCase()}`

  return {
    config,

    resolveAccess: (userId) =>
      resolveFactoryAccess(userId, {
        accessRepo: config.accessRepo,
        github,
        cache: redisCache(),
        async findGitHubAccountId(id) {
          const row = await db.query.account.findFirst({
            columns: { accountId: true },
            where: and(eq(account.userId, id), eq(account.providerId, 'github')),
          })
          return row?.accountId ?? null
        },
      }),

    async loadHub() {
      const cache = redisCache()
      const cached = await cache.get(hubCacheKey).catch(() => null)
      if (cached) return JSON.parse(cached) as FactoryHub

      const hub = await loadHub(github, config.hubRepo)
      await cache.set(hubCacheKey, JSON.stringify(hub), HUB_TTL_SECONDS).catch((err: unknown) => {
        logger.warn({ err }, 'Could not cache the factory hub')
      })
      return hub
    },

    async getUserState(userId) {
      const row = await db.query.factoryUserState.findFirst({
        columns: { onboardedAt: true },
        where: eq(factoryUserState.userId, userId),
      })
      return row ?? null
    },

    async setOnboarded(userId, login, onboarded) {
      const now = new Date()
      const onboardedAt = onboarded ? now : null
      const [row] = await db
        .insert(factoryUserState)
        .values({ userId, githubLogin: login, onboardedAt })
        .onConflictDoUpdate({
          target: factoryUserState.userId,
          set: { githubLogin: login, onboardedAt, updatedAt: now },
        })
        .returning({ onboardedAt: factoryUserState.onboardedAt })
      return row
    },
  }
}
