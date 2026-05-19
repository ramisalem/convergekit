import { Redis } from 'ioredis'

const MAX_REPLAY_TTL_SECONDS = 10 * 60

export type SamlReplayCache = {
  set(
    key: string,
    value: string,
    ttlMode: 'EX',
    ttlSeconds: number,
    mode: 'NX',
  ): Promise<'OK' | null>
}

let redisClient: Redis | null = null

export function getSamlReplayRedis(): Redis {
  if (!redisClient) {
    const url = process.env.REDIS_URL
    redisClient = url ? new Redis(url) : new Redis()
  }
  return redisClient
}

export async function assertSamlReplayAllowed(input: {
  assertionId: string
  expiresAt: Date
  cache?: SamlReplayCache | null
}) {
  if (!input.assertionId) throw new Error('SAML assertion id is required for replay protection')

  const ttlSeconds = Math.max(
    1,
    Math.min(MAX_REPLAY_TTL_SECONDS, Math.ceil((input.expiresAt.getTime() - Date.now()) / 1000)),
  )
  const cache = input.cache ?? getSamlReplayRedis()

  let result: 'OK' | null
  try {
    result = await cache.set(`saml:replay:${input.assertionId}`, '1', 'EX', ttlSeconds, 'NX')
  } catch {
    throw new Error('SAML replay cache is unreachable; rejecting assertion')
  }

  if (result !== 'OK') throw new Error('SAML assertion replay detected')
}
