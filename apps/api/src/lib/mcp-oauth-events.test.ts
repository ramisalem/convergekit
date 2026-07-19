import { describe, expect, it, vi } from 'vitest'
import { logger } from '../logger.js'
import { emitMcpOAuthEvent } from './mcp-oauth-events.js'

describe('emitMcpOAuthEvent', () => {
  it('logs the event name and only safe fields', () => {
    const spy = vi.spyOn(logger, 'info').mockImplementation(() => logger)
    emitMcpOAuthEvent('token_issued', { userId: 'u1', clientId: 'c1', familyId: 'f1' })
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'mcp.oauth.token_issued', userId: 'u1', clientId: 'c1' }),
      'mcp oauth event',
    )
    spy.mockRestore()
  })
})
