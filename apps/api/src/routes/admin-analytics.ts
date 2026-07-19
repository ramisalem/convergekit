import { getAnalyticsHealth, getAnalyticsKpis, getAnalyticsUtilization } from '@convergekit/db'
import { Hono } from 'hono'
import { z } from 'zod'

export const adminAnalyticsRoutes = new Hono()

// `/admin/*` is already gated by requireAuth + requireAdmin in app.ts — do NOT
// re-apply auth here.

const windowSchema = z.enum(['7d', '30d', '90d'])

function parseWindow(raw: string | undefined) {
  return windowSchema.parse(raw ?? '30d')
}

adminAnalyticsRoutes.get('/kpis', async (c) => {
  let window
  try {
    window = parseWindow(c.req.query('window'))
  } catch {
    return c.json({ error: 'Invalid window. Use 7d, 30d, or 90d.' }, 400)
  }
  try {
    return c.json(await getAnalyticsKpis(window))
  } catch (error) {
    console.error('[admin-analytics] kpis failed', error)
    return c.json({ error: 'Failed to load KPI metrics.' }, 500)
  }
})

adminAnalyticsRoutes.get('/health', async (c) => {
  let window
  try {
    window = parseWindow(c.req.query('window'))
  } catch {
    return c.json({ error: 'Invalid window. Use 7d, 30d, or 90d.' }, 400)
  }
  try {
    return c.json(await getAnalyticsHealth(window))
  } catch (error) {
    console.error('[admin-analytics] health failed', error)
    return c.json({ error: 'Failed to load health metrics.' }, 500)
  }
})

adminAnalyticsRoutes.get('/utilization', async (c) => {
  let window
  try {
    window = parseWindow(c.req.query('window'))
  } catch {
    return c.json({ error: 'Invalid window. Use 7d, 30d, or 90d.' }, 400)
  }
  try {
    return c.json(await getAnalyticsUtilization(window))
  } catch (error) {
    console.error('[admin-analytics] utilization failed', error)
    return c.json({ error: 'Failed to load utilization metrics.' }, 500)
  }
})
