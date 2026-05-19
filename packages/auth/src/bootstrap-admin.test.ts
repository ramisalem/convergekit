import { describe, expect, it } from 'vitest'

import { resolveAccessPolicyConfig } from '@convergekit/config/access-policy'
import {
  authUserAdditionalFields,
  getOAuthProviderIdFromContext,
  resolveOAuthUserCreate,
} from './bootstrap-admin.js'

const examplePolicy = resolveAccessPolicyConfig({
  ACCESS_ALLOWED_EMAIL_DOMAIN: 'example.com',
})

describe('OAuth user creation policy', () => {
  it('registers role as a Better Auth additional user field', () => {
    expect(authUserAdditionalFields.role).toEqual({
      type: ['admin', 'user'],
      required: false,
      defaultValue: 'user',
      input: false,
    })
  })

  it('allows bootstrap admin creation only from GitHub', () => {
    const result = resolveOAuthUserCreate({
      providerId: 'github',
      adminCount: 0,
      initialAdminEmail: 'hassan.shabbir@example.com',
      accessPolicy: examplePolicy,
      userData: {
        email: 'hassan.shabbir@example.com',
        name: 'Hassan Shabbir',
      },
    })

    expect(result).toEqual({
      data: {
        email: 'hassan.shabbir@example.com',
        name: 'Hassan Shabbir',
        role: 'admin',
      },
    })
  })

  it('rejects Google creation while no admin exists', () => {
    expect(() =>
      resolveOAuthUserCreate({
        providerId: 'google' as never,
        adminCount: 0,
        initialAdminEmail: 'hassan.shabbir@example.com',
        accessPolicy: examplePolicy,
        userData: {
          email: 'hassan.shabbir@example.com',
        },
      }),
    ).toThrowError(/signup disabled/i)
  })

  it('allows marked workforce SAML internal user creation after bootstrap', () => {
    const result = resolveOAuthUserCreate({
      providerId: null,
      adminCount: 1,
      initialAdminEmail: 'hassan.shabbir@example.com',
      accessPolicy: examplePolicy,
      userData: {
        email: 'alice@example.com',
        name: 'Alice',
        __source: 'workforce-saml',
      },
    })

    expect(result).toEqual({
      data: {
        email: 'alice@example.com',
        name: 'Alice',
      },
    })
    expect(result.data).not.toHaveProperty('__source')
  })

  it('rejects unmarked internal user creation', () => {
    expect(() =>
      resolveOAuthUserCreate({
        providerId: null,
        adminCount: 1,
        initialAdminEmail: 'hassan.shabbir@example.com',
        accessPolicy: examplePolicy,
        userData: {
          email: 'alice@example.com',
          name: 'Alice',
        },
      }),
    ).toThrowError(/signup disabled/i)
  })

  it('rejects GitHub self-signup after bootstrap', () => {
    expect(() =>
      resolveOAuthUserCreate({
        providerId: 'github',
        adminCount: 1,
        initialAdminEmail: 'hassan.shabbir@example.com',
        accessPolicy: examplePolicy,
        userData: {
          email: 'someone@example.com',
        },
      }),
    ).toThrowError(/signup disabled/i)
  })

  it('throws a sign-up disabled error when the bootstrap email is outside the configured domain', () => {
    expect(() =>
      resolveOAuthUserCreate({
        providerId: 'github',
        adminCount: 0,
        initialAdminEmail: 'hassan.shabbir@other.test',
        accessPolicy: examplePolicy,
        userData: {
          email: 'hassan.shabbir@other.test',
        },
      }),
    ).toThrowError(/signup disabled/i)
  })

  it('extracts only GitHub OAuth provider id from Better Auth callback params', () => {
    expect(getOAuthProviderIdFromContext({ params: { id: 'github' } })).toBe('github')
    expect(() => getOAuthProviderIdFromContext({ params: { id: 'google' } })).toThrowError(
      /signup disabled/i,
    )
  })

  it('returns null only when OAuth context is absent for internal plugin handling', () => {
    expect(getOAuthProviderIdFromContext(undefined)).toBeNull()
    expect(() => getOAuthProviderIdFromContext({ params: {} })).toThrowError(/signup disabled/i)
    expect(() => getOAuthProviderIdFromContext(null)).toThrowError(/signup disabled/i)
  })

  it('fails closed when Better Auth hook context does not expose the provider id', () => {
    expect(() => getOAuthProviderIdFromContext({ params: {} })).toThrowError(/signup disabled/i)
    expect(() => getOAuthProviderIdFromContext(null)).toThrowError(/signup disabled/i)
  })
})
