export const MAX_CHAT_TOOL_STEPS = 5
export const MAX_CHAT_TOTAL_STEPS = MAX_CHAT_TOOL_STEPS + 1

export function prepareChatStep({ stepNumber }: { stepNumber: number }) {
  if (stepNumber < MAX_CHAT_TOOL_STEPS) {
    return undefined
  }

  return { activeTools: [] }
}
