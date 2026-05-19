import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getApiBaseUrl, getWebBaseUrl } from '../../../lib/runtime-urls'

const API_URL = getApiBaseUrl()
const WEB_URL = getWebBaseUrl()

/**
 * GET /api/sign-out
 *
 * Same-origin sign-out proxy. The browser navigates here (same origin as the
 * web app), so SameSite=Lax cookies on the public app origin can be forwarded
 * by the Next.js server in a server-to-server POST — bypassing the cross-origin
 * SameSite restriction that would block a client-side fetch.
 *
 * Flow:
 * 1. Browser GET → this route (same origin as the web app)
 * 2. Server POST → better-auth /api/auth/sign-out (server-to-server, forwards cookie)
 * 3. Clear the session cookie on the browser response
 * 4. Redirect to sign-in
 */
export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie') ?? ''

  // Forward the session cookie server-side — no SameSite restriction here
  await fetch(`${API_URL}/api/auth/sign-out`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: cookieHeader,
    },
    body: '{}',
  }).catch(() => undefined) // best-effort; session may already be gone

  const res = NextResponse.redirect(`${WEB_URL}/en/auth/sign-in`)

  // Clear all known better-auth cookies on the browser
  for (const name of ['better-auth.session_token', 'better-auth.session_data']) {
    res.cookies.set(name, '', {
      maxAge: 0,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    })
  }

  return res
}
