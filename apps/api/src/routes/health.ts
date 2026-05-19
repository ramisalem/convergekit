import { Hono } from 'hono'

const VERSION = process.env.npm_package_version ?? '0.0.1'

export const healthRoutes = new Hono()

healthRoutes.get('/', (c) => c.json({ status: 'ok', version: VERSION }))
