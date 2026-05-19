import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('chat stream error diagnostics', () => {
  it('logs provider stream errors before returning the masked SDK error event', () => {
    const source = readFileSync(new URL('./chat.ts', import.meta.url), 'utf8')

    expect(source).toContain('result.toUIMessageStreamResponse({')
    expect(source).toContain('onError')
    expect(source).toContain('logger.error')
    expect(source).toContain('Chat stream failed')
  })
})
