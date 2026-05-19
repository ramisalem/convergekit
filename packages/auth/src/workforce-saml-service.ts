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
      const email = String(
        extract.nameID || extract.attributes?.email || extract.attributes?.mail || '',
      )
      const assertionId = String(extract.assertion?.id || extract.response?.id || '')
      const notOnOrAfter = resolveWorkforceSamlNotOnOrAfter({
        conditionsNotOnOrAfter: extract.conditions?.notOnOrAfter,
        subjectConfirmationNotOnOrAfter: extract.subjectConfirmationData?.notOnOrAfter,
      })

      return {
        assertionId,
        email,
        name: typeof extract.attributes?.name === 'string' ? extract.attributes.name : null,
        notOnOrAfter,
        relayState: input.relayState,
      }
    },
  }
}
