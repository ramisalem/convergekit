import { describe, expect, it, vi } from 'vitest'

import type { WorkforceSsoConfig } from '@convergekit/config/workforce-sso'
import {
  buildWorkforceSamlService,
  configureWorkforceSamlSchemaValidator,
  parseWorkforceSamlSigningCertificates,
  resolveWorkforceSamlIdentity,
  resolveWorkforceSamlNotOnOrAfter,
} from './workforce-saml-service.js'

const enabledConfig: WorkforceSsoConfig = {
  workforceSsoEnabled: true,
  providerLabel: 'Authentik',
  idpSsoUrl: 'https://authentik.example.com/application/saml/colab-ai-hub/sso/binding/redirect/',
  idpEntityId: 'https://authentik.example.com',
  idpCertificate: '-----BEGIN CERTIFICATE-----\nMIID\n-----END CERTIFICATE-----',
  spEntityId: 'urn:convergekit:dev',
  acsUrl: 'http://localhost:4001/api/auth/workforce-saml/acs',
  startUrl: 'http://localhost:4000/en/auth/sign-in',
  sessionTtlDays: 14,
  supportAdminEmails: [],
}

describe('buildWorkforceSamlService', () => {
  it('configures samlify with an XML schema validator before parsing SAML responses', () => {
    const setSchemaValidator = vi.fn()
    const validator = { validate: async () => 'valid' }

    configureWorkforceSamlSchemaValidator({ setSchemaValidator }, validator)

    expect(setSchemaValidator).toHaveBeenCalledWith(validator)
  })

  it('returns null when workforce SSO is disabled', () => {
    expect(buildWorkforceSamlService({ ...enabledConfig, workforceSsoEnabled: false })).toBeNull()
  })

  it('exposes SP metadata with the configured entity ID and ACS URL', () => {
    const service = buildWorkforceSamlService(enabledConfig)

    expect(service?.getMetadata()).toContain('urn:convergekit:dev')
    expect(service?.getMetadata()).toContain('http://localhost:4001/api/auth/workforce-saml/acs')
  })

  it('creates an IdP login URL with a SAML request', async () => {
    const service = buildWorkforceSamlService(enabledConfig)

    await expect(service?.createLoginUrl('/en/repositories')).resolves.toContain('SAMLRequest=')
  })

  it('parses multiple signing certificates from one env value for Google rollover', () => {
    expect(
      parseWorkforceSamlSigningCertificates(`
-----BEGIN CERTIFICATE-----
FIRST
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
SECOND
-----END CERTIFICATE-----
`),
    ).toEqual([
      '-----BEGIN CERTIFICATE-----\nFIRST\n-----END CERTIFICATE-----',
      '-----BEGIN CERTIFICATE-----\nSECOND\n-----END CERTIFICATE-----',
    ])
  })

  it('parses escaped PEM newlines from env-style certificate values', () => {
    expect(
      parseWorkforceSamlSigningCertificates(
        '-----BEGIN CERTIFICATE-----\\nFIRST\\n-----END CERTIFICATE-----',
      ),
    ).toEqual(['-----BEGIN CERTIFICATE-----\nFIRST\n-----END CERTIFICATE-----'])
  })

  it('requires SAML NotOnOrAfter rather than inventing a fallback expiry', () => {
    expect(() =>
      resolveWorkforceSamlNotOnOrAfter({
        conditionsNotOnOrAfter: undefined,
        subjectConfirmationNotOnOrAfter: undefined,
      }),
    ).toThrow(/NotOnOrAfter/i)
  })

  it('rejects invalid SAML NotOnOrAfter values', () => {
    expect(() =>
      resolveWorkforceSamlNotOnOrAfter({
        conditionsNotOnOrAfter: 'not-a-date',
        subjectConfirmationNotOnOrAfter: undefined,
      }),
    ).toThrow(/NotOnOrAfter/i)
  })

  it('prefers condition NotOnOrAfter and falls back to subject confirmation data', () => {
    expect(
      resolveWorkforceSamlNotOnOrAfter({
        conditionsNotOnOrAfter: '2030-01-01T00:00:00.000Z',
        subjectConfirmationNotOnOrAfter: '2029-01-01T00:00:00.000Z',
      }).toISOString(),
    ).toBe('2030-01-01T00:00:00.000Z')

    expect(
      resolveWorkforceSamlNotOnOrAfter({
        conditionsNotOnOrAfter: undefined,
        subjectConfirmationNotOnOrAfter: '2029-01-01T00:00:00.000Z',
      }).toISOString(),
    ).toBe('2029-01-01T00:00:00.000Z')
  })

  it('uses an email-shaped NameID when the IdP sends no email attribute', () => {
    expect(resolveWorkforceSamlIdentity({ nameID: 'user@example.com', attributes: {} })).toEqual({
      email: 'user@example.com',
      name: null,
    })
  })

  it('falls back to Authentik claim-URI attributes when the NameID is opaque', () => {
    expect(
      resolveWorkforceSamlIdentity({
        nameID: 'a1b2c3d4e5f6',
        attributes: {
          'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': 'user@example.com',
          'http://schemas.goauthentik.io/2021/02/saml/name': 'Test User',
        },
      }),
    ).toEqual({ email: 'user@example.com', name: 'Test User' })
  })

  it('prefers the email attribute over a UPN-shaped NameID', () => {
    // Authentik's UPN NameID mapping emits `user@corp.internal`, which is email-shaped but is
    // not the address the account is keyed on — and would be denied by ACCESS_ALLOWED_EMAIL_DOMAIN.
    expect(
      resolveWorkforceSamlIdentity({
        nameID: 'user@corp.internal',
        attributes: {
          'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': 'user@example.com',
        },
      }),
    ).toEqual({ email: 'user@example.com', name: null })
  })

  it('reads friendly email/name attribute names and unwraps array values', () => {
    expect(
      resolveWorkforceSamlIdentity({
        nameID: undefined,
        attributes: { email: ['user@example.com'], name: ['Test User'] },
      }),
    ).toEqual({ email: 'user@example.com', name: 'Test User' })
  })

  it('rejects an opaque NameID when no email attribute is present', () => {
    expect(() => resolveWorkforceSamlIdentity({ nameID: 'a1b2c3d4e5f6', attributes: {} })).toThrow(
      /resolvable email identity/,
    )
  })

  it('reads OID email and name attributes and skips empty array members', () => {
    expect(
      resolveWorkforceSamlIdentity({
        nameID: undefined,
        attributes: {
          'urn:oid:0.9.2342.19200300.100.1.3': ['', 'user@example.com'],
          'urn:oid:2.5.4.3': ['', 'Test User'],
        },
      }),
    ).toEqual({ email: 'user@example.com', name: 'Test User' })
  })

  it('rejects responses without any resolvable email identity', () => {
    expect(() => resolveWorkforceSamlIdentity({ nameID: undefined, attributes: {} })).toThrow(
      /resolvable email identity/,
    )
    expect(() => resolveWorkforceSamlIdentity({ nameID: '', attributes: { email: '' } })).toThrow(
      /resolvable email identity/,
    )
  })

  it('rejects malformed SAML responses', async () => {
    const service = buildWorkforceSamlService(enabledConfig)

    await expect(
      service?.validateResponse({ samlResponse: '', relayState: undefined }),
    ).rejects.toThrow()
  }, 15_000)
})
