import { describe, expect, it } from 'vitest'

import type { AccessPolicyConfig } from '@convergekit/config/access-policy'
import {
  WORKFORCE_SAML_PROVIDER_ID,
  normalizeSamlEmail,
  resolveRelayState,
  resolveWorkforceSamlSignIn,
} from './workforce-saml-policy.js'

const accessPolicy: AccessPolicyConfig = {
  allowedEmailDomain: 'example.com',
  allowedGitHubOrg: 'example-org',
  allowedRepositoryHost: 'github.com',
}

const activeUser = {
  id: 'user-1',
  email: 'alice@example.com',
  role: 'user' as const,
  groupId: null,
  deactivatedAt: null,
}

describe('workforce SAML policy', () => {
  it('pins the provider id', () => {
    expect(WORKFORCE_SAML_PROVIDER_ID).toBe('workforce-saml')
  })

  it('normalizes SAML email addresses', () => {
    expect(normalizeSamlEmail(' Alice@Example.com ', accessPolicy)).toBe('alice@example.com')
  })

  it('rejects malformed or non-policy emails', () => {
    expect(() => normalizeSamlEmail('not-email', accessPolicy)).toThrow(/email/i)
    expect(() => normalizeSamlEmail('alice@other.test', accessPolicy)).toThrow(/domain/i)
  })

  it('rejects SAML auto-provisioning before the first admin exists', () => {
    expect(
      resolveWorkforceSamlSignIn({
        email: 'alice@example.com',
        adminCount: 0,
        existingUser: null,
        accessPolicy,
      }),
    ).toMatchObject({ allowed: false, code: 'bootstrap_admin_required' })
  })

  it('creates new SAML users as regular no-group users after bootstrap', () => {
    expect(
      resolveWorkforceSamlSignIn({
        email: 'alice@example.com',
        adminCount: 1,
        existingUser: null,
        accessPolicy,
      }),
    ).toMatchObject({
      allowed: true,
      action: 'create',
      data: { role: 'user', groupId: null },
    })
  })

  it('reuses active existing users without changing role or group', () => {
    expect(
      resolveWorkforceSamlSignIn({
        email: 'alice@example.com',
        adminCount: 1,
        existingUser: { ...activeUser, role: 'admin', groupId: 'group-1' },
        accessPolicy,
      }),
    ).toMatchObject({
      allowed: true,
      action: 'reuse',
      userId: 'user-1',
    })
  })

  it('rejects deactivated existing users', () => {
    expect(
      resolveWorkforceSamlSignIn({
        email: 'alice@example.com',
        adminCount: 1,
        existingUser: { ...activeUser, deactivatedAt: new Date('2026-05-01') },
        accessPolicy,
      }),
    ).toMatchObject({ allowed: false, code: 'user_deactivated' })
  })

  it('accepts only safe relative RelayState paths', () => {
    expect(resolveRelayState(undefined)).toBe('/en/repositories')
    expect(resolveRelayState('/en/repositories?tab=settings')).toBe('/en/repositories?tab=settings')
    expect(resolveRelayState('https://evil.example')).toBe('/en/repositories')
    expect(resolveRelayState('//evil.example')).toBe('/en/repositories')
    expect(resolveRelayState('/en/repositories\nSet-Cookie:x')).toBe('/en/repositories')
  })
})
