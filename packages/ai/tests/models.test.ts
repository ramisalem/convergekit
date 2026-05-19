import { describe, expect, it } from 'vitest'
import { getOpenRouterChatModelSettings } from '../src/models.js'

describe('getOpenRouterChatModelSettings', () => {
  it('disables reasoning for OpenRouter DeepSeek V4 chat models so tool calls can continue', () => {
    expect(getOpenRouterChatModelSettings('deepseek/deepseek-v4-flash')).toEqual({
      extraBody: {
        reasoning: {
          effort: 'none',
        },
      },
    })
  })

  it('leaves non-DeepSeek-V4 OpenRouter chat models unchanged', () => {
    expect(getOpenRouterChatModelSettings('anthropic/claude-sonnet-4.5')).toBeUndefined()
    expect(getOpenRouterChatModelSettings('deepseek/deepseek-v3.2')).toBeUndefined()
  })
})
