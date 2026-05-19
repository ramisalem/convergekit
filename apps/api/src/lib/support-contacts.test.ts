import { describe, expect, it } from 'vitest'

import { resolveAccessPolicyConfig } from '@convergekit/config/access-policy'
import { buildSupportContacts } from './support-contacts.js'

const examplePolicy = resolveAccessPolicyConfig({
  ACCESS_ALLOWED_EMAIL_DOMAIN: 'example.com',
})

describe('buildSupportContacts', () => {
  it('prefers active admins over configured fallback emails', () => {
    expect(
      buildSupportContacts({
        activeAdmins: [
          { name: 'Admin One', email: 'admin.one@example.com' },
          { name: 'Admin Two', email: 'admin.two@example.com' },
        ],
        fallbackEmails: ['platform@example.com'],
        accessPolicy: examplePolicy,
      }),
    ).toEqual([
      { name: 'Admin One', email: 'admin.one@example.com' },
      { name: 'Admin Two', email: 'admin.two@example.com' },
    ])
  })

  it('uses fallback emails when no active admins are available', () => {
    expect(
      buildSupportContacts({
        activeAdmins: [],
        fallbackEmails: ['platform@example.com'],
        accessPolicy: examplePolicy,
      }),
    ).toEqual([{ name: 'platform@example.com', email: 'platform@example.com' }])
  })

  it('drops admin rows whose email is outside the access policy domain', () => {
    expect(
      buildSupportContacts({
        activeAdmins: [
          { name: 'Stale Test User', email: 'testuser1@other.test' },
          { name: 'Real Admin', email: 'real.admin@example.com' },
        ],
        fallbackEmails: [],
        accessPolicy: examplePolicy,
      }),
    ).toEqual([{ name: 'Real Admin', email: 'real.admin@example.com' }])
  })

  it('falls back to policy-allowed fallback emails when every admin is outside the policy', () => {
    expect(
      buildSupportContacts({
        activeAdmins: [{ name: 'Stale', email: 'stale@other.test' }],
        fallbackEmails: ['platform@example.com', 'noreply@other.test'],
        accessPolicy: examplePolicy,
      }),
    ).toEqual([{ name: 'platform@example.com', email: 'platform@example.com' }])
  })

  it('returns an empty list when neither admins nor fallback emails satisfy the access policy', () => {
    expect(
      buildSupportContacts({
        activeAdmins: [{ name: 'Stale', email: 'stale@other.test' }],
        fallbackEmails: ['noreply@other.test'],
        accessPolicy: examplePolicy,
      }),
    ).toEqual([])
  })
})
