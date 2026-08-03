import type { WorkforceSsoConfig } from '@convergekit/config/workforce-sso'
import * as samlifyNodeXmllintValidator from '@authenio/samlify-node-xmllint'
import * as samlify from 'samlify'

export type ValidatedSamlResponse = {
  assertionId: string
  email: string
  name: string | null
  notOnOrAfter: Date
  relayState: string | undefined
}

export function configureWorkforceSamlSchemaValidator(
  samlLibrary: { setSchemaValidator: (validator: { validate: (xml: string) => Promise<unknown> }) => void },
  validator: { validate: (xml: string) => Promise<unknown> },
) {
  samlLibrary.setSchemaValidator(validator)
}

configureWorkforceSamlSchemaValidator(samlify, samlifyNodeXmllintValidator)

export function parseWorkforceSamlSigningCertificates(rawCertificate: string): string[] {
  const normalizedCertificate = rawCertificate.replace(/\\n/g, '\n')
  const pemMatches = normalizedCertificate.match(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
  )
  if (pemMatches?.length) {
    return pemMatches.map((certificate) => certificate.trim())
  }

  return normalizedCertificate
    .split(',')
    .map((certificate) => certificate.trim())
    .filter(Boolean)
}

// Attribute names checked for the user's email, in order. Authentik's default SAML
// property mappings emit the WS-Fed claim URI; plain `email`/`mail` cover IdPs with
// friendly attribute names.
const EMAIL_ATTRIBUTE_KEYS = [
  'email',
  'mail',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
  'urn:oid:0.9.2342.19200300.100.1.3',
]

const NAME_ATTRIBUTE_KEYS = [
  'name',
  'http://schemas.goauthentik.io/2021/02/saml/name',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
  'urn:oid:2.5.4.3',
]

function firstAttributeString(
  attributes: Record<string, unknown> | undefined,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = attributes?.[key]
    const candidates = Array.isArray(value) ? value : [value]
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    }
  }
  return null
}

export function resolveWorkforceSamlIdentity(extract: {
  nameID?: unknown
  attributes?: Record<string, unknown>
}): { email: string; name: string | null } {
  const nameId = typeof extract.nameID === 'string' ? extract.nameID.trim() : ''
  const attributeEmail = firstAttributeString(extract.attributes, EMAIL_ATTRIBUTE_KEYS)

  // The explicit email attribute wins over the NameID. SAML NameID is an opaque subject
  // identifier by design, and Authentik's NameID mapping is deployment-configurable: it may
  // be a hashed user ID, a UPN (`user@corp.internal`), or the email address. Only the email
  // attribute is guaranteed to be the address the account should be keyed on, so an
  // email-shaped-but-wrong NameID (UPN) must not shadow it. The NameID is the fallback for
  // IdPs that send no email attribute at all.
  const email = attributeEmail ?? nameId
  if (!email.includes('@')) {
    // An opaque or empty identity must never reach account lookup/linking downstream — it
    // would otherwise be rejected one layer later with a much vaguer error.
    throw new Error('SAML response did not contain a resolvable email identity')
  }

  return {
    email,
    name: firstAttributeString(extract.attributes, NAME_ATTRIBUTE_KEYS),
  }
}

export function resolveWorkforceSamlNotOnOrAfter(input: {
  conditionsNotOnOrAfter: unknown
  subjectConfirmationNotOnOrAfter: unknown
}): Date {
  const raw = input.conditionsNotOnOrAfter ?? input.subjectConfirmationNotOnOrAfter
  if (!raw) throw new Error('SAML NotOnOrAfter is required')

  const notOnOrAfter = raw instanceof Date ? raw : new Date(String(raw))
  if (Number.isNaN(notOnOrAfter.getTime())) {
    throw new Error('SAML NotOnOrAfter is invalid')
  }
  return notOnOrAfter
}

export function buildWorkforceSamlService(config: WorkforceSsoConfig) {
  if (!config.workforceSsoEnabled) return null
  if (
    !config.idpSsoUrl ||
    !config.idpEntityId ||
    !config.idpCertificate ||
    !config.spEntityId ||
    !config.acsUrl
  ) {
    throw new Error('Workforce SSO is enabled but SAML config is incomplete')
  }

  const serviceProvider = samlify.ServiceProvider({
    entityID: config.spEntityId,
    assertionConsumerService: [
      { Binding: samlify.Constants.namespace.binding.post, Location: config.acsUrl },
    ],
  })
  const identityProvider = samlify.IdentityProvider({
    entityID: config.idpEntityId,
    singleSignOnService: [
      { Binding: samlify.Constants.namespace.binding.redirect, Location: config.idpSsoUrl },
    ],
    signingCert: parseWorkforceSamlSigningCertificates(config.idpCertificate),
  })

  return {
    getMetadata() {
      return serviceProvider.getMetadata()
    },
    async createLoginUrl(relayState?: string) {
      const { context } = serviceProvider.createLoginRequest(identityProvider, 'redirect') as {
        context: string
      }
      if (!relayState) return context

      const separator = context.includes('?') ? '&' : '?'
      return `${context}${separator}RelayState=${encodeURIComponent(relayState)}`
    },
    async validateResponse(input: {
      samlResponse: string
      relayState?: string
    }): Promise<ValidatedSamlResponse> {
      const result = await serviceProvider.parseLoginResponse(identityProvider, 'post', {
        body: { SAMLResponse: input.samlResponse, RelayState: input.relayState },
      })
      const extract = result.extract as {
        nameID?: unknown
        attributes?: Record<string, unknown>
        assertion?: { id?: unknown }
        response?: { id?: unknown }
        conditions?: { notOnOrAfter?: unknown }
        subjectConfirmationData?: { notOnOrAfter?: unknown }
      }
      const identity = resolveWorkforceSamlIdentity(extract)
      const assertionId = String(extract.assertion?.id || extract.response?.id || '')
      const notOnOrAfter = resolveWorkforceSamlNotOnOrAfter({
        conditionsNotOnOrAfter: extract.conditions?.notOnOrAfter,
        subjectConfirmationNotOnOrAfter: extract.subjectConfirmationData?.notOnOrAfter,
      })

      return {
        assertionId,
        email: identity.email,
        name: identity.name,
        notOnOrAfter,
        relayState: input.relayState,
      }
    },
  }
}
