import { createHmac, timingSafeEqual } from 'node:crypto'
import type { McpScope } from './mcp-token-policy.js'

export type ConsentRequest = {
  clientId: string
  redirectUri: string
  scopes: McpScope[]
  codeChallenge: string
  codeChallengeMethod: string
  state: string | null
  userId: string
  exp: number
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function signConsentRequest(request: ConsentRequest, secret: string): string {
  const payload = Buffer.from(JSON.stringify(request), 'utf8').toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

export function verifyConsentRequest(token: string, secret: string): ConsentRequest | null {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null

  const expected = sign(payload, secret)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const request = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ConsentRequest
    if (typeof request.exp !== 'number' || request.exp <= Date.now()) return null
    return request
  } catch {
    return null
  }
}
