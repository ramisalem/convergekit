import { describe, expect, it } from 'vitest'
import { extractCodeReferences, linkCodeReferences } from './chat-code-references'

describe('linkCodeReferences', () => {
  it('turns repository file citations into markdown anchors', () => {
    const result = linkCodeReferences(
      'See app/controllers/auth_controller.rb:16-20 and app/controllers/v2/authentications_controller.rb:14–22.',
    )

    expect(result).toContain(
      '[app/controllers/auth_controller.rb:16-20](#code-reference-app%2Fcontrollers%2Fauth_controller.rb%3A16-20)',
    )
    expect(result).toContain(
      '[app/controllers/v2/authentications_controller.rb:14–22](#code-reference-app%2Fcontrollers%2Fv2%2Fauthentications_controller.rb%3A14%E2%80%9322)',
    )
  })

  it('does not rewrite code blocks, inline code, or existing markdown links', () => {
    const content = [
      'Already linked: [app/controllers/auth_controller.rb:16-20](https://example.com).',
      'Inline code: `app/models/user.rb:1-4`.',
      '```',
      'app/controllers/plain_text.rb:2-8',
      '```',
    ].join('\n')

    expect(linkCodeReferences(content)).toBe(content)
  })

  it('extracts unique source references for the assistant sources strip', () => {
    expect(
      extractCodeReferences(
        'Use app/controllers/auth_controller.rb:16-20, app/controllers/auth_controller.rb:16-20, and README.md.',
      ),
    ).toEqual([
      {
        href: '#code-reference-app%2Fcontrollers%2Fauth_controller.rb%3A16-20',
        lineRange: '16-20',
        path: 'app/controllers/auth_controller.rb',
        reference: 'app/controllers/auth_controller.rb:16-20',
      },
      {
        href: '#code-reference-README.md',
        lineRange: null,
        path: 'README.md',
        reference: 'README.md',
      },
    ])
  })

  it('formats obvious code identifiers as inline code chips', () => {
    const result = linkCodeReferences(
      'AuthController calls the new method, V2::AuthenticationsController validates login_required, and EmployeeLeave.sync_to_analytics is triggered.',
    )

    expect(result).toContain('`AuthController`')
    expect(result).toContain('`new` method')
    expect(result).toContain('`V2::AuthenticationsController`')
    expect(result).toContain('`login_required`')
    expect(result).toContain('`EmployeeLeave.sync_to_analytics`')
  })

  it('formats class-style identifiers from source summaries', () => {
    const result = linkCodeReferences(
      'The App class is bootstrapped by CodeMain and managed by CodeApplication.',
    )

    expect(result).toContain('The `App` class')
    expect(result).toContain('`CodeMain`')
    expect(result).toContain('`CodeApplication`')
  })

  it('does not turn sentence boundaries into inline code chips', () => {
    const result = linkCodeReferences(
      "The deductions are being handled.Let me search deduction types.Now I have categories.Based on the analysis.",
    )

    expect(result).toBe(
      "The deductions are being handled.Let me search deduction types.Now I have categories.Based on the analysis.",
    )
  })
})
