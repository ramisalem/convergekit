import { Hono } from 'hono'
import { emitMcpOAuthEvent } from '../lib/mcp-oauth-events.js'
import {
  findOAuthClient,
  listConnectedAgents,
  revokeGrantsForUserClient,
} from '../lib/mcp-oauth-store.js'

export const meConnectedAgentsRoutes = new Hono()

meConnectedAgentsRoutes.get('/connected-agents', async (c) => {
  const userId = c.get('userId')
  const agents = await listConnectedAgents(userId)
  const withNames = await Promise.all(
    agents.map(async (a) => {
      const client = await findOAuthClient(a.clientId)
      return {
        clientId: a.clientId,
        clientName: client?.clientName ?? a.clientId,
        createdAt: a.createdAt.toISOString(),
        lastUsedAt: a.lastUsedAt ? a.lastUsedAt.toISOString() : null,
      }
    }),
  )
  return c.json({ agents: withNames })
})

meConnectedAgentsRoutes.delete('/connected-agents/:clientId', async (c) => {
  const userId = c.get('userId')
  const clientId = c.req.param('clientId')
  const revoked = await revokeGrantsForUserClient(userId, clientId, 'user_revoked')
  emitMcpOAuthEvent('token_revoked', { userId, clientId, initiator: 'user' })
  return c.json({ revoked })
})
