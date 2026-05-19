import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { HonoAdapter } from '@bull-board/hono'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { serveStatic } from '@hono/node-server/serve-static'
import { ZodError } from 'zod'
import { repositoryQueue, incrementalQueue, translationQueue, mindMapQueue, wikiGenerationQueue } from '@convergekit/queues'
import { AppError } from './errors.js'
import { logger } from './logger.js'
import { requireAuth } from './middleware/require-auth.js'
import { requireAdmin } from './middleware/require-admin.js'
import { requireMcpToken } from './middleware/require-mcp-token.js'
import { requestLogger } from './middleware/request-logger.js'
import { authRoutes } from './routes/auth.js'
import { chatRoutes } from './routes/chat.js'
import { documentRoutes } from './routes/documents.js'
import { healthRoutes } from './routes/health.js'
import { jobRoutes } from './routes/jobs.js'
import { mcpRoutes } from './routes/mcp.js'
import { notificationRoutes } from './routes/notifications.js'
import { repositoryRoutes } from './routes/repositories.js'
import { settingsRoutes } from './routes/settings.js'
import { wikiRoutes } from './routes/wiki.js'
import { groupRoutes } from './routes/groups.js'
import { userManagementRoutes } from './routes/users.js'
import { meRoutes } from './routes/me.js'
import { inviteRoutes } from './routes/invites.js'

// ─── Bull Board setup (JDW-33) ────────────────────────────────────────────────
const bullBoardAdapter = new HonoAdapter(serveStatic)
createBullBoard({
  queues: [
    new BullMQAdapter(repositoryQueue),
    new BullMQAdapter(incrementalQueue),
    new BullMQAdapter(translationQueue),
    new BullMQAdapter(mindMapQueue),
    new BullMQAdapter(wikiGenerationQueue),
  ],
  serverAdapter: bullBoardAdapter,
})
bullBoardAdapter.setBasePath('/api/admin/queues')

export function createApp() {
  const app = new Hono().basePath('/api')

  app.use('*', secureHeaders())
  app.use('*', cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*', credentials: true }))
  app.use('*', requestLogger)

  // ─── Public routes (no auth) ───────────────────────────────────────────────
  app.route('/health', healthRoutes)
  app.route('/auth', authRoutes)
  app.route('/invites', inviteRoutes)

  // ─── Protected routes (cookie session or Bearer token) ────────────────────
  app.use('/repositories/*', requireAuth)
  app.use('/documents/*', requireAuth)
  app.use('/chat/*', requireAuth)
  app.use('/jobs/*', requireAuth)
  app.use('/notifications/*', requireAuth)
  app.use('/settings/*', requireAuth, requireAdmin)
  app.use('/wiki/*', requireAuth)
  app.use('/me/*', requireAuth)
  app.use('/groups/*', requireAuth, requireAdmin)
  app.use('/users/*', requireAuth, requireAdmin)

  app.route('/repositories', repositoryRoutes)
  app.route('/documents', documentRoutes)
  app.route('/chat', chatRoutes)
  app.route('/jobs', jobRoutes)
  app.route('/notifications', notificationRoutes)
  app.route('/settings', settingsRoutes)
  app.route('/wiki', wikiRoutes)
  app.route('/me', meRoutes)
  app.route('/groups', groupRoutes)
  app.route('/users', userManagementRoutes)

  // ─── Admin routes (session auth, admin-only) ──────────────────────────────
  app.use('/admin/*', requireAuth, requireAdmin)
  app.route('/admin/queues', bullBoardAdapter.registerPlugin())

  // ─── MCP routes (scoped token auth) ───────────────────────────────────────
  app.use('/mcp/*', requireMcpToken)
  app.route('/mcp', mcpRoutes)

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code }, err.statusCode as 400)
    }

    if (err instanceof ZodError) {
      return c.json({ error: 'Validation failed', issues: err.flatten().fieldErrors }, 422)
    }

    logger.error({ err }, 'Unhandled error')
    return c.json({ error: 'Internal server error' }, 500)
  })

  app.notFound((c) => c.json({ error: 'Not found' }, 404))

  return app
}

export type AppType = ReturnType<typeof createApp>
