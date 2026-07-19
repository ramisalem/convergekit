import { describe, expect, it } from 'vitest'
import { summarizeErrorForLog } from './logging.js'

describe('summarizeErrorForLog', () => {
  it('omits request and response bodies from provider errors', () => {
    const summary = summarizeErrorForLog({
      name: 'AI_APICallError',
      message: 'Key limit exceeded',
      statusCode: 403,
      url: 'https://openrouter.ai/api/v1/embeddings',
      requestBodyValues: { input: ['sensitive repository content'] },
      responseBody: '{"error":"too much detail"}',
      stack: 'stack trace',
    })

    expect(summary).toEqual({
      name: 'AI_APICallError',
      message: 'Key limit exceeded',
      statusCode: 403,
      url: 'https://openrouter.ai/api/v1/embeddings',
      code: undefined,
      isRetryable: undefined,
    })
    expect(JSON.stringify(summary)).not.toContain('sensitive repository content')
    expect(JSON.stringify(summary)).not.toContain('responseBody')
    expect(JSON.stringify(summary)).not.toContain('stack trace')
  })
})
