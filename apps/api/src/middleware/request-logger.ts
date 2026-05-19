import type { MiddlewareHandler } from 'hono'
import { logger } from '../logger.js'

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now()
  await next()
  const duration = Date.now() - start
  logger.info({
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration,
  })
}
