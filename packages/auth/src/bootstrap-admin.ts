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
  userData: BootstrapUserData
}

function throwSignUpDisabled(): never {
  throw APIError.from('UNAUTHORIZED', {
    message: 'signup disabled',
    code: 'SIGNUP_DISABLED',
  })
}

type ResolveOAuthUserCreateResult =
  | { data: BootstrapUserData & { role: 'admin' } }
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

  throwSignUpDisabled()
}
