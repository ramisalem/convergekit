import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { logger } from './logger.js'

const app = createApp()
const port = Number(process.env.API_PORT ?? process.env.PORT) || 4001

serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`API listening on http://localhost:${info.port}`)
})
