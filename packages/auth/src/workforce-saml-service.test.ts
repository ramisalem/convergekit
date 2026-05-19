import { describe, expect, it, vi } from 'vitest'

import type { WorkforceSsoConfig } from '@convergekit/config/workforce-sso'
import {
  buildWorkforceSamlService,
  configureWorkforceSamlSchemaValidator,
  parseWorkforceSamlSigningCertificates,
  resolveWorkforceSamlNotOnOrAfter,
} from './workforce-saml-service.js'

const enabledConfig: WorkforceSsoConfig = {
  workforceSsoEnabled: true,
  providerLabel: 'Workforce SSO',
  idpSsoUrl: 'https://accounts.google.com/o/saml2/idp?idpid=test',
  idpEntityId: 'https://accounts.google.com/o/saml2?idpid=test',
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

  it('rejects malformed SAML responses', async () => {
    const service = buildWorkforceSamlService(enabledConfig)

    await expect(
      service?.validateResponse({ samlResponse: '', relayState: undefined }),
    ).rejects.toThrow()
  })
})
