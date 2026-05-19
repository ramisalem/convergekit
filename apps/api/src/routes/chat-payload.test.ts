import { describe, expect, it } from 'vitest'
import { parseChatRequestBody } from './chat-payload.js'

describe('chat request payload parsing', () => {
  const sessionId = '11111111-1111-4111-8111-111111111111'
  const repositoryId = '22222222-2222-4222-8222-222222222222'

  it('accepts the Vercel AI SDK useChat payload sent directly to the API', () => {
    expect(
      parseChatRequestBody({
        id: 'client-chat-id',
        sessionId,
        repositoryId,
        messages: [
          { role: 'assistant', content: 'Hi' },
          {
            role: 'user',
            content: '',
            parts: [{ type: 'text', text: 'Where is the authentication logic?' }],
          },
        ],
      }),
    ).toEqual({
      sessionId,
      repositoryId,
      message: 'Where is the authentication logic?',
    })
  })

  it('continues to accept the normalized backend chat payload', () => {
    expect(
      parseChatRequestBody({
        sessionId,
        repositoryId,
        message: 'Explain the folder structure.',
      }),
    ).toEqual({
      sessionId,
      repositoryId,
      message: 'Explain the folder structure.',
    })
  })
})
