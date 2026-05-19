import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { checkRateLimit } from '../lib/rate-limit.js'
import { verifyInviteToken, consumeInviteToken } from '../lib/invites.js'

export const inviteRoutes = new Hono()

const setPasswordSchema = z.object({
  token: z.string().length(64),
  password: z.string().min(8).max(200),
})

function clientKey(c: Context): string {
  const fwd = c.req.header('x-forwarded-for')
  const ip = fwd?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown'
  return ip
}

// GET /api/invites/verify?token=...
inviteRoutes.get('/verify', async (c) => {
  const rl = await checkRateLimit(clientKey(c), 'auth-signin')
  if (!rl.allowed) {
    return c.json({ error: 'Too many requests' }, 429, {
      'Retry-After': String(rl.retryAfterSeconds ?? 60),
    })
  }

  const token = c.req.query('token') ?? ''
  const result = await verifyInviteToken(token)
  if (!result) return c.json({ error: 'Invalid or expired token' }, 404)

  return c.json({ email: result.email, hasPassword: result.hasPassword })
})

// POST /api/invites/set-password
inviteRoutes.post('/set-password', async (c) => {
  const rl = await checkRateLimit(clientKey(c), 'auth-signin')
  if (!rl.allowed) {
    return c.json({ error: 'Too many requests' }, 429, {
      'Retry-After': String(rl.retryAfterSeconds ?? 60),
    })
  }

  const body = setPasswordSchema.parse(await c.req.json())
  const ok = await consumeInviteToken(body.token, body.password)
  if (!ok) return c.json({ error: 'Invalid or expired token' }, 404)

  return c.json({ success: true })
})
