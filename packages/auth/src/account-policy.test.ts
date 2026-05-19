import { describe, expect, it } from 'vitest'

import {
  buildAccountPolicyConfig,
  buildAdvancedAuthConfig,
  buildSessionPolicyConfig,
} from './account-policy.js'

describe('Better Auth account and session policy', () => {
  it('keeps account linking limited to trusted GitHub accounts after Google OAuth cleanup', () => {
    const config = buildAccountPolicyConfig()

    expect(config.accountLinking).toMatchObject({
      enabled: true,
      trustedProviders: ['github'],
      allowDifferentEmails: false,
      updateUserInfoOnLink: false,
    })
    expect(config.create).toBeUndefined()
  })

  it('builds a non-sliding app-wide session config from CONVERGEKIT_SESSION_TTL_DAYS', () => {
    expect(buildSessionPolicyConfig(14)).toEqual({
      expiresIn: 60 * 60 * 24 * 14,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    })
  })

  it('bypasses Better Auth origin checks only for the SAML ACS route when SSO is enabled', () => {
    const config = buildAdvancedAuthConfig({
      nodeEnv: 'development',
      workforceSsoEnabled: true,
    })

    expect(config.disableOriginCheck).toEqual(['/workforce-saml/acs'])
    expect(config.defaultCookieAttributes).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    })
  })

  it('keeps origin checks enabled when workforce SSO is disabled', () => {
    expect(
      buildAdvancedAuthConfig({
        nodeEnv: 'production',
        workforceSsoEnabled: false,
      }),
    ).toEqual({
      disableOriginCheck: false,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      },
    })
  })
})
