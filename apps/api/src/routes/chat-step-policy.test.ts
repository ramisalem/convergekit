import { describe, expect, it } from 'vitest'
import { MAX_CHAT_TOOL_STEPS, MAX_CHAT_TOTAL_STEPS, prepareChatStep } from './chat-step-policy.js'

describe('chat step policy', () => {
  it('leaves tools available while the model is still gathering context', () => {
    expect(prepareChatStep({ stepNumber: MAX_CHAT_TOOL_STEPS - 1 })).toBeUndefined()
  })

  it('reserves one final no-tools step so the model synthesizes an answer', () => {
    expect(MAX_CHAT_TOTAL_STEPS).toBe(MAX_CHAT_TOOL_STEPS + 1)
    expect(prepareChatStep({ stepNumber: MAX_CHAT_TOOL_STEPS })).toEqual({ activeTools: [] })
  })
})
