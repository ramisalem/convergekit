import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const localApiProxyUrl = process.env.LOCAL_API_PROXY_URL ?? 'http://localhost:4001'
const enableLocalApiProxy =
  process.env.NODE_ENV !== 'production' && process.env.DISABLE_LOCAL_API_PROXY !== 'true'
const localApiProxyRoutes = [
  '/api/admin/:path*',
  '/api/auth/:path*',
  '/api/chat/sessions',
  '/api/chat/sessions/:path*',
  '/api/documents/:path*',
  '/api/groups/:path*',
  '/api/health',
  '/api/jobs/:path*',
  '/api/mcp/:path*',
  '/api/me/:path*',
  '/api/notifications/jobs/:path*',
  '/api/repositories/:path*',
  '/api/settings/:path*',
  '/api/users/:path*',
  '/api/wiki/:path*',
]

const nextConfig: NextConfig = {
  transpilePackages: ['@convergekit/types', 'fumadocs-ui', 'fumadocs-core'],
  experimental: {
    devtoolSegmentExplorer: false,
  },
  async rewrites() {
    if (!enableLocalApiProxy) return []

    return {
      // Keep local browser traffic production-shaped. These must run before the
      // [locale] route, otherwise /api/repositories is interpreted as locale=api.
      beforeFiles: localApiProxyRoutes.map((source) => ({
        source,
        destination: `${localApiProxyUrl}${source}`,
      })),
    }
  },
}

export default withNextIntl(nextConfig)
