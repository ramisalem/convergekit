import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('chat history API routes', () => {
  it('exposes repository-scoped session list, read, and delete routes', () => {
    const source = readFileSync(new URL('./chat.ts', import.meta.url), 'utf8')

    expect(source).toContain("chatRoutes.get('/', async")
    expect(source).toContain("chatRoutes.get('/sessions/:sessionId', async")
    expect(source).toContain("chatRoutes.delete('/sessions/:sessionId', async")
    expect(source).not.toContain('c.json({ sessions: [] })')
  })

  it('validates session ownership before streaming chat responses', () => {
    const source = readFileSync(new URL('./chat.ts', import.meta.url), 'utf8')

    expect(source).toContain('getChatSession(userId, repositoryId, sessionId)')
    expect(source).toContain('getBoundedChatHistory(sessionId)')
    expect(source).toContain('Chat session not found')
  })
})
