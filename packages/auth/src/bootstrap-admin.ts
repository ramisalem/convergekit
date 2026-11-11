import {
  type AccessPolicyConfig,
  accessPolicyConfig,
  isAllowedAccessPolicyEmail,
} from '@convergekit/config/access-policy'
import { APIError } from 'better-auth'

export const authUserAdditionalFields = {
  role: {
    type: ['admin', 'user'] as ('admin' | 'user')[],
    required: false,
    defaultValue: 'user',
    input: false,
  },
} as const

type BootstrapUserData = {
  email?: string
  __source?: 'workforce-saml'
  [key: string]: unknown
}

type ResolveOAuthUserCreateInput = {
  adminCount: number
  initialAdminEmail?: string
  accessPolicy?: AccessPolicyConfig
  /** True when this GitHub user is a collaborator on the factory access repo and member sign-up is on. */
  factoryMember?: boolean
  userData: BootstrapUserData
}

function throwSignUpDisabled(): never {
  throw APIError.from('UNAUTHORIZED', {
    message: 'signup disabled',
    code: 'SIGNUP_DISABLED',
  })
}

type ResolveOAuthUserCreateResult =
  | { data: BootstrapUserData & { role: 'admin' | 'user' } }
  | { data: BootstrapUserData }

export type OAuthProviderId = 'github'

export function getOAuthProviderIdFromContext(context: unknown): OAuthProviderId | null {
  if (context === undefined) return null
  const params = (context as { params?: { id?: unknown } } | null)?.params
  const id = params?.id
  if (id === 'github') return id
  throwSignUpDisabled()
}

export function resolveOAuthUserCreate({
  providerId,
  adminCount,
  initialAdminEmail,
  accessPolicy = accessPolicyConfig,
  factoryMember = false,
  userData,
}: ResolveOAuthUserCreateInput & {
  providerId: OAuthProviderId | null
}): ResolveOAuthUserCreateResult {
  const email = userData.email

  if (providerId === null) {
    if (userData.__source !== 'workforce-saml') throwSignUpDisabled()
    const { __source: _omit, ...sanitized } = userData
    return { data: sanitized }
  }

  if (
    providerId === 'github' &&
    adminCount === 0 &&
    initialAdminEmail &&
    email === initialAdminEmail &&
    isAllowedAccessPolicyEmail(email, accessPolicy)
  ) {
    return { data: { ...userData, role: 'admin' as const } }
  }

  if (
    providerId === 'github' &&
    factoryMember &&
    email &&
    isAllowedAccessPolicyEmail(email, accessPolicy)
  ) {
    return { data: { ...userData, role: 'user' as const } }
  }

  throwSignUpDisabled()
}
