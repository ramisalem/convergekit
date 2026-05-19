import { describe, expect, it } from 'vitest'

import { parseTransferChatHistoryArgs } from './transfer-chat-history.js'

describe('transfer chat history maintenance script', () => {
  it('defaults to dry-run mode for a valid old/new email mapping', () => {
    expect(
      parseTransferChatHistoryArgs([
        '--from-email',
        'adi@example.com',
        '--to-email',
        'adityaraval@example.com',
      ]),
    ).toEqual({
      apply: false,
      fromEmail: 'adi@example.com',
      toEmail: 'adityaraval@example.com',
    })
  })

  it('requires both email addresses', () => {
    expect(() => parseTransferChatHistoryArgs(['--from-email', 'adi@example.com'])).toThrow(
      /--to-email is required/,
    )
  })

  it('requires an explicit confirmation phrase before applying writes', () => {
    expect(() =>
      parseTransferChatHistoryArgs([
        '--from-email',
        'adi@example.com',
        '--to-email',
        'adityaraval@example.com',
        '--apply',
      ]),
    ).toThrow(/--confirm adi@example.com->adityaraval@example.com/)

    expect(
      parseTransferChatHistoryArgs([
        '--from-email',
        'adi@example.com',
        '--to-email',
        'adityaraval@example.com',
        '--apply',
        '--confirm',
        'adi@example.com->adityaraval@example.com',
      ]),
    ).toEqual({
      apply: true,
      fromEmail: 'adi@example.com',
      toEmail: 'adityaraval@example.com',
    })
  })
})
