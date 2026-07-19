import { resolveMcpOAuthConfig } from '@convergekit/config/mcp-oauth'
import { Hono } from 'hono'
import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
} from '../lib/mcp-oauth-metadata.js'

const config = resolveMcpOAuthConfig(process.env)

export const wellKnownRoutes = new Hono()

wellKnownRoutes.get('/oauth-authorization-server', (c) => {
  if (!config.enabled || !config.issuerUrl) return c.json({ error: 'Not found' }, 404)
  return c.json(buildAuthorizationServerMetadata(config.issuerUrl))
})

wellKnownRoutes.get('/oauth-protected-resource', (c) => {
  if (!config.enabled || !config.issuerUrl || !config.resourceUrl) {
    return c.json({ error: 'Not found' }, 404)
  }
  return c.json(buildProtectedResourceMetadata(config.issuerUrl, config.resourceUrl))
})
