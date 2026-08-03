import { describe, expect, it } from 'vitest'

import type { AccessPolicyConfig } from './access-policy.js'
import { resolveWorkforceSsoConfig } from './workforce-sso.js'

const accessPolicy: AccessPolicyConfig = {
  allowedEmailDomain: 'example.com',
  allowedGitHubOrg: 'example-org',
  allowedRepositoryHost: 'github.com',
}

describe('resolveWorkforceSsoConfig', () => {
  it('defaults workforce SSO to disabled with Colab Ai Hub SSO label and 14-day sessions', () => {
    expect(resolveWorkforceSsoConfig({}, accessPolicy)).toMatchObject({
      workforceSsoEnabled: false,
      providerLabel: 'Colab Ai Hub SSO',
      sessionTtlDays: 14,
      supportAdminEmails: [],
    })
  })

  it('allows disabled SAML config to be staged without IdP values', () => {
    expect(
      resolveWorkforceSsoConfig(
        {
          WORKFORCE_SSO_ENABLED: 'false',
          WORKFORCE_SAML_SP_ENTITY_ID: 'urn:convergekit:dev',
        },
        accessPolicy,
      ).workforceSsoEnabled,
    ).toBe(false)
  })

  it('requires complete SAML IdP and SP config when enabled', () => {
    expect(() =>
      resolveWorkforceSsoConfig({ WORKFORCE_SSO_ENABLED: 'true' }, accessPolicy),
    ).toThrow(/WORKFORCE_SAML_IDP_SSO_URL/i)
  })

  it('returns complete enabled SAML configuration', () => {
    expect(
      resolveWorkforceSsoConfig(
        {
          WORKFORCE_SSO_ENABLED: 'true',
          WORKFORCE_SSO_PROVIDER_LABEL: 'ConvergeKit Workspace',
          WORKFORCE_SAML_IDP_SSO_URL: 'https://accounts.google.com/o/saml2/idp?idpid=test',
          WORKFORCE_SAML_IDP_ENTITY_ID: 'https://accounts.google.com/o/saml2?idpid=test',
          WORKFORCE_SAML_IDP_CERT: '-----BEGIN CERTIFICATE-----\nMIID\n-----END CERTIFICATE-----',
          WORKFORCE_SAML_SP_ENTITY_ID: 'urn:convergekit:dev',
          WORKFORCE_SAML_ACS_URL: 'http://localhost:4001/api/auth/workforce-saml/acs',
          WORKFORCE_SAML_START_URL: 'http://localhost:4000/en/auth/sign-in',
          CONVERGEKIT_SESSION_TTL_DAYS: '14',
          ACCESS_SUPPORT_ADMIN_EMAILS: 'Admin@Example.Com, support@example.com',
        },
        accessPolicy,
      ),
    ).toMatchObject({
      workforceSsoEnabled: true,
      providerLabel: 'ConvergeKit Workspace',
      idpSsoUrl: 'https://accounts.google.com/o/saml2/idp?idpid=test',
      idpEntityId: 'https://accounts.google.com/o/saml2?idpid=test',
      spEntityId: 'urn:convergekit:dev',
      acsUrl: 'http://localhost:4001/api/auth/workforce-saml/acs',
      startUrl: 'http://localhost:4000/en/auth/sign-in',
      sessionTtlDays: 14,
      supportAdminEmails: ['admin@example.com', 'support@example.com'],
    })
  })

  it('rejects invalid TTL and invalid URLs', () => {
    expect(() =>
      resolveWorkforceSsoConfig(
        {
          WORKFORCE_SSO_ENABLED: 'true',
          WORKFORCE_SAML_IDP_SSO_URL: 'not-a-url',
          WORKFORCE_SAML_IDP_ENTITY_ID: 'idp',
          WORKFORCE_SAML_IDP_CERT: 'cert',
          WORKFORCE_SAML_SP_ENTITY_ID: 'sp',
          WORKFORCE_SAML_ACS_URL: 'http://localhost:4001/api/auth/workforce-saml/acs',
          CONVERGEKIT_SESSION_TTL_DAYS: '0',
        },
        accessPolicy,
      ),
    ).toThrow(/WORKFORCE_SAML_IDP_SSO_URL|CONVERGEKIT_SESSION_TTL_DAYS/i)
  })
})
