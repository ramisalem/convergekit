import createMiddleware from 'next-intl/middleware'
import type { NextRequest } from 'next/server'
import { routing } from './i18n/routing'
import { resolvePublicOrigin, rewriteRedirectLocation } from './lib/middleware-public-origin'

const intlMiddleware = createMiddleware(routing)

export default function middleware(request: NextRequest) {
  const response = intlMiddleware(request)
  const location = response.headers.get('location')
  if (!location) return response

  response.headers.set(
    'location',
    rewriteRedirectLocation({
      location,
      publicOrigin: resolvePublicOrigin({
        configuredWebUrl: process.env.NEXT_PUBLIC_WEB_URL,
        forwardedHost: request.headers.get('x-forwarded-host'),
        forwardedProto: request.headers.get('x-forwarded-proto'),
        requestOrigin: request.nextUrl.origin,
      }),
    }),
  )

  return response
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
