export function buildAccountPolicyConfig() {
  return {
    accountLinking: {
      enabled: true,
      trustedProviders: ['github'],
      allowDifferentEmails: false,
      disableImplicitLinking: false,
      updateUserInfoOnLink: false,
    },
  }
}

export function buildSessionPolicyConfig(sessionTtlDays: number) {
  return {
    expiresIn: 60 * 60 * 24 * sessionTtlDays,
    disableSessionRefresh: true,
    cookieCache: { enabled: false },
  }
}

export function buildAdvancedAuthConfig(input: {
  nodeEnv?: string
  workforceSsoEnabled: boolean
}) {
  return {
    defaultCookieAttributes: {
      httpOnly: true,
      secure: input.nodeEnv === 'production',
      sameSite: 'lax' as const,
    },
    // Better Auth 1.6.9 accepts path-scoped origin bypasses at runtime,
    // while the public init type still narrows this option to boolean.
    disableOriginCheck: input.workforceSsoEnabled
      ? (['/workforce-saml/acs'] as unknown as boolean)
      : false,
  }
}
