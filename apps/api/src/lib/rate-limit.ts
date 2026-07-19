/**
 * Sliding-window rate limiter backed by Redis sorted sets — JDW-46
 *
 * Supports multiple rate-limit "scopes" (chat, auth-signin, etc.)
 * with independent window sizes and max request counts.
 */

import { Redis } from 'ioredis'

let client: Redis | null = null

function getRedis(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL
    client = url ? new Redis(url) : new Redis()
  }
  return client
}

export interface RateLimitResult {
  allowed: boolean
  /** Seconds until the oldest request leaves the window (only set when denied) */
  retryAfterSeconds?: number
}

interface RateLimitConfig {
  windowMs: number
  maxRequests: number
}

const SCOPES: Record<string, RateLimitConfig> = {
  chat: { windowMs: 60_000, maxRequests: 20 },
  'auth-signin': { windowMs: 300_000, maxRequests: 5 },
  'mcp-token': { windowMs: 60_000, maxRequests: 120 },
  'mcp-user': { windowMs: 60_000, maxRequests: 300 },
}

export async function checkRateLimit(
  key: string,
  scope: string = 'chat',
): Promise<RateLimitResult> {
  const config = SCOPES[scope] ?? SCOPES.chat
  const redis = getRedis()
  const redisKey = `ratelimit:${scope}:${key}`
  const now = Date.now()
  const windowStart = now - config.windowMs

  const pipeline = redis.pipeline()
  pipeline.zremrangebyscore(redisKey, 0, windowStart)
  pipeline.zadd(redisKey, now, String(now))
  pipeline.zcard(redisKey)
  pipeline.zrange(redisKey, 0, 0, 'WITHSCORES')
  pipeline.expire(redisKey, Math.ceil(config.windowMs / 1000))

  const results = await pipeline.exec()
  const count = (results?.[2]?.[1] as number) ?? 0

  if (count <= config.maxRequests) {
    return { allowed: true }
  }

  const oldest = (results?.[3]?.[1] as string[]) ?? []
  const oldestTs = oldest.length >= 2 ? Number(oldest[1]) : now
  const retryAfterMs = oldestTs + config.windowMs - now
  const retryAfterSeconds = Math.ceil(Math.max(retryAfterMs, 1000) / 1000)

  await redis.zrem(redisKey, String(now))

  return { allowed: false, retryAfterSeconds }
}
