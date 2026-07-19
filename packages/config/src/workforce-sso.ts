import { z } from 'zod'

import type { AccessPolicyConfig } from './access-policy.js'
import { normalizeAccessPolicyEmail } from './access-policy.js'

export type WorkforceSsoConfig = {
  workforceSsoEnabled: boolean
  providerLabel: string
  idpSsoUrl: string | null
  idpEntityId: string | null
  idpCertificate: string | null
  spEntityId: string | null
  acsUrl: string | null
  startUrl: string | null
  sessionTtlDays: number
  supportAdminEmails: string[]
}

const ttlSchema = z.coerce
  .number()
  .int('CONVERGEKIT_SESSION_TTL_DAYS must be an integer')
  .positive('CONVERGEKIT_SESSION_TTL_DAYS must be positive')
  .max(90, 'CONVERGEKIT_SESSION_TTL_DAYS must be 90 or less')

const optionalNonEmpty = z
  .string()
  .trim()
  .min(1)
  .optional()
  .or(z.literal('').transform(() => undefined))
  .transform((value) => value || undefined)

const urlSchema = z.string().url()

const workforceSsoEnvSchema = z.object({
  WORKFORCE_SSO_ENABLED: z.enum(['true', 'false']).optional().default('false'),
  WORKFORCE_SSO_PROVIDER_LABEL: optionalNonEmpty.transform((value) => value ?? 'ConvergeKit SSO'),
  WORKFORCE_SAML_IDP_SSO_URL: optionalNonEmpty,
  WORKFORCE_SAML_IDP_ENTITY_ID: optionalNonEmpty,
  WORKFORCE_SAML_IDP_CERT: optionalNonEmpty,
  WORKFORCE_SAML_SP_ENTITY_ID: optionalNonEmpty,
  WORKFORCE_SAML_ACS_URL: optionalNonEmpty,
  WORKFORCE_SAML_START_URL: optionalNonEmpty,
  CONVERGEKIT_SESSION_TTL_DAYS: ttlSchema.optional().default(14),
  ACCESS_SUPPORT_ADMIN_EMAILS: z.string().optional().default(''),
})

function parseSupportAdminEmails(raw: string): string[] {
  return raw
    .split(',')
    .map((email) => normalizeAccessPolicyEmail(email))
    .filter(Boolean)
}

function requireWhenEnabled(name: string, value: string | undefined): string {
  if (value) return value
  throw new Error(
    `Invalid workforce SSO configuration: ${name} is required when WORKFORCE_SSO_ENABLED=true`,
  )
}

function requireUrlWhenEnabled(name: string, value: string | undefined): string {
  const requiredValue = requireWhenEnabled(name, value)
  const result = urlSchema.safeParse(requiredValue)
  if (!result.success) {
    throw new Error(`Invalid workforce SSO configuration: ${name} must be a valid URL`)
  }
  return result.data
}

export function resolveWorkforceSsoConfig(
  runtimeEnv: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  _accessPolicy?: AccessPolicyConfig,
): WorkforceSsoConfig {
  const result = workforceSsoEnvSchema.safeParse(runtimeEnv)
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid workforce SSO configuration: ${details}`)
  }

  const enabled = result.data.WORKFORCE_SSO_ENABLED === 'true'

  if (!enabled) {
    return {
      workforceSsoEnabled: false,
      providerLabel: result.data.WORKFORCE_SSO_PROVIDER_LABEL,
      idpSsoUrl: result.data.WORKFORCE_SAML_IDP_SSO_URL ?? null,
      idpEntityId: result.data.WORKFORCE_SAML_IDP_ENTITY_ID ?? null,
      idpCertificate: result.data.WORKFORCE_SAML_IDP_CERT ?? null,
      spEntityId: result.data.WORKFORCE_SAML_SP_ENTITY_ID ?? null,
      acsUrl: result.data.WORKFORCE_SAML_ACS_URL ?? null,
      startUrl: result.data.WORKFORCE_SAML_START_URL ?? null,
      sessionTtlDays: result.data.CONVERGEKIT_SESSION_TTL_DAYS,
      supportAdminEmails: parseSupportAdminEmails(result.data.ACCESS_SUPPORT_ADMIN_EMAILS),
    }
  }

  return {
    workforceSsoEnabled: true,
    providerLabel: result.data.WORKFORCE_SSO_PROVIDER_LABEL,
    idpSsoUrl: requireUrlWhenEnabled(
      'WORKFORCE_SAML_IDP_SSO_URL',
      result.data.WORKFORCE_SAML_IDP_SSO_URL,
    ),
    idpEntityId: requireWhenEnabled(
      'WORKFORCE_SAML_IDP_ENTITY_ID',
      result.data.WORKFORCE_SAML_IDP_ENTITY_ID,
    ),
    idpCertificate: requireWhenEnabled(
      'WORKFORCE_SAML_IDP_CERT',
      result.data.WORKFORCE_SAML_IDP_CERT,
    ),
    spEntityId: requireWhenEnabled(
      'WORKFORCE_SAML_SP_ENTITY_ID',
      result.data.WORKFORCE_SAML_SP_ENTITY_ID,
    ),
    acsUrl: requireUrlWhenEnabled('WORKFORCE_SAML_ACS_URL', result.data.WORKFORCE_SAML_ACS_URL),
    startUrl: result.data.WORKFORCE_SAML_START_URL
      ? requireUrlWhenEnabled('WORKFORCE_SAML_START_URL', result.data.WORKFORCE_SAML_START_URL)
      : null,
    sessionTtlDays: result.data.CONVERGEKIT_SESSION_TTL_DAYS,
    supportAdminEmails: parseSupportAdminEmails(result.data.ACCESS_SUPPORT_ADMIN_EMAILS),
  }
}
