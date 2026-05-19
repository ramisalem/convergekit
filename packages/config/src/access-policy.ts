import { z } from 'zod'

export type AccessPolicyConfig = {
  allowedEmailDomain: string | null
  allowedGitHubOrg: string | null
  allowedRepositoryHost: string
}

export type AccessPolicyRepositoryInput = {
  provider: string
  cloneUrl: string
}

export type ParsedGitHubRepositoryUrl = {
  host: string
  owner: string
  name: string
  fullName: string
}

export const DEFAULT_ACCESS_POLICY_CONFIG: AccessPolicyConfig = {
  allowedEmailDomain: null,
  allowedGitHubOrg: null,
  allowedRepositoryHost: 'github.com',
}

const domainLabel = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
const domainPattern = new RegExp(`^${domainLabel}(?:\\.${domainLabel})+$`)
const githubOrgPattern = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/

const optionalNormalizedDomainSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z
    .string()
    .trim()
    .toLowerCase()
    .regex(domainPattern, 'must be a DNS domain such as example.com')
    .optional(),
)

const optionalNormalizedGitHubOrgSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z
    .string()
    .trim()
    .toLowerCase()
    .regex(githubOrgPattern, 'must be a GitHub organization slug')
    .optional(),
)

const normalizedRepositoryHostSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(domainPattern, 'must be a DNS domain such as github.com')

const accessPolicyEnvSchema = z
  .object({
    ACCESS_ALLOWED_EMAIL_DOMAIN: optionalNormalizedDomainSchema.optional(),
    ACCESS_ALLOWED_GITHUB_ORG: optionalNormalizedGitHubOrgSchema.optional(),
    ACCESS_ALLOWED_REPOSITORY_HOST: normalizedRepositoryHostSchema.default(
      DEFAULT_ACCESS_POLICY_CONFIG.allowedRepositoryHost,
    ),
  })
  .transform(
    (value): AccessPolicyConfig => ({
      allowedEmailDomain: value.ACCESS_ALLOWED_EMAIL_DOMAIN ?? null,
      allowedGitHubOrg: value.ACCESS_ALLOWED_GITHUB_ORG ?? null,
      allowedRepositoryHost: value.ACCESS_ALLOWED_REPOSITORY_HOST,
    }),
  )

export class AccessPolicyViolationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AccessPolicyViolationError'
  }
}

export function resolveAccessPolicyConfig(
  runtimeEnv: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): AccessPolicyConfig {
  const result = accessPolicyEnvSchema.safeParse(runtimeEnv)
  if (!result.success) {
    const details = result.error.issues.map((issue) => issue.message).join('; ')
    throw new Error(`Invalid access policy configuration: ${details}`)
  }
  return result.data
}

export const accessPolicyConfig = resolveAccessPolicyConfig()

export function normalizeAccessPolicyEmail(email: string): string {
  return email.trim().toLowerCase()
}

function getEmailDomain(email: string): string | null {
  const normalized = normalizeAccessPolicyEmail(email)
  const at = normalized.lastIndexOf('@')
  if (at <= 0 || at === normalized.length - 1) return null
  return normalized.slice(at + 1)
}

export function isAllowedAccessPolicyEmail(
  email: string,
  config: AccessPolicyConfig = accessPolicyConfig,
): boolean {
  if (!config.allowedEmailDomain) return true
  return getEmailDomain(email) === config.allowedEmailDomain
}

export function assertAllowedAccessPolicyEmail(
  email: string,
  config: AccessPolicyConfig = accessPolicyConfig,
): void {
  if (!isAllowedAccessPolicyEmail(email, config)) {
    throw new AccessPolicyViolationError(`Email must use the ${config.allowedEmailDomain} domain`)
  }
}

export function parseGitHubRepositoryUrl(cloneUrl: string): ParsedGitHubRepositoryUrl | null {
  let parsed: URL
  try {
    parsed = new URL(cloneUrl)
  } catch {
    return null
  }

  const host = parsed.hostname.toLowerCase()
  const [owner, rawName] = parsed.pathname.split('/').filter(Boolean)
  if (!owner || !rawName) return null

  const name = rawName.replace(/\.git$/i, '')
  if (!name) return null

  const normalizedOwner = owner.toLowerCase()
  return {
    host,
    owner: normalizedOwner,
    name,
    fullName: `${normalizedOwner}/${name}`,
  }
}

export function isAllowedAccessPolicyRepository(
  repository: AccessPolicyRepositoryInput,
  config: AccessPolicyConfig = accessPolicyConfig,
): boolean {
  if (repository.provider !== 'github') return false
  const parsed = parseGitHubRepositoryUrl(repository.cloneUrl)
  if (!parsed) return false
  if (parsed.host !== config.allowedRepositoryHost) return false
  if (config.allowedGitHubOrg && parsed.owner !== config.allowedGitHubOrg) return false
  return true
}

export function assertAllowedAccessPolicyRepository(
  repository: AccessPolicyRepositoryInput,
  config: AccessPolicyConfig = accessPolicyConfig,
): ParsedGitHubRepositoryUrl {
  const parsed = parseGitHubRepositoryUrl(repository.cloneUrl)
  if (
    repository.provider !== 'github' ||
    !parsed ||
    parsed.host !== config.allowedRepositoryHost ||
    (config.allowedGitHubOrg && parsed.owner !== config.allowedGitHubOrg)
  ) {
    const ownerRule = config.allowedGitHubOrg ? `/${config.allowedGitHubOrg}` : ''
    throw new AccessPolicyViolationError(
      `Repository must be a GitHub repository under ${config.allowedRepositoryHost}${ownerRule}`,
    )
  }
  return parsed
}
