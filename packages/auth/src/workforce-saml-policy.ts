import type { AccessPolicyConfig } from '@convergekit/config/access-policy'
import {
  accessPolicyConfig,
  isAllowedAccessPolicyEmail,
  normalizeAccessPolicyEmail,
} from '@convergekit/config/access-policy'

export const WORKFORCE_SAML_PROVIDER_ID = 'workforce-saml'
const DEFAULT_RELAY_STATE = '/en/repositories'

export type ExistingWorkforceUser = {
  id: string
  email: string
  role: 'admin' | 'user'
  groupId: string | null
  deactivatedAt: Date | null
}

export type WorkforceSamlSignInDecision =
  | { allowed: true; action: 'reuse'; userId: string }
  | { allowed: true; action: 'create'; data: { role: 'user'; groupId: null } }
  | {
      allowed: false
      code: 'invalid_email_domain' | 'bootstrap_admin_required' | 'user_deactivated'
    }

export function normalizeSamlEmail(
  email: unknown,
  accessPolicy: AccessPolicyConfig = accessPolicyConfig,
): string {
  if (typeof email !== 'string') throw new Error('SAML email is required')
  const normalized = normalizeAccessPolicyEmail(email)
  if (!normalized || !normalized.includes('@')) throw new Error('SAML email is invalid')
  if (!isAllowedAccessPolicyEmail(normalized, accessPolicy)) {
    throw new Error(`SAML email must use the ${accessPolicy.allowedEmailDomain} domain`)
  }
  return normalized
}

export function resolveWorkforceSamlSignIn(input: {
  email: string
  adminCount: number
  existingUser: ExistingWorkforceUser | null
  accessPolicy?: AccessPolicyConfig
}): WorkforceSamlSignInDecision {
  const accessPolicy = input.accessPolicy ?? accessPolicyConfig
  if (!isAllowedAccessPolicyEmail(input.email, accessPolicy)) {
    return { allowed: false, code: 'invalid_email_domain' }
  }
  if (input.existingUser?.deactivatedAt) {
    return { allowed: false, code: 'user_deactivated' }
  }
  if (input.existingUser) {
    return { allowed: true, action: 'reuse', userId: input.existingUser.id }
  }
  if (input.adminCount <= 0) {
    // The first admin must come through GitHub OAuth, not SSO: requireAuth demands a linked
    // GitHub account with an access token for every admin (admins index repositories through
    // GitHub), so an SSO-provisioned admin would be 401'd on every request.
    return { allowed: false, code: 'bootstrap_admin_required' }
  }
  return { allowed: true, action: 'create', data: { role: 'user', groupId: null } }
}

export function resolveRelayState(relayState: unknown): string {
  if (typeof relayState !== 'string' || relayState.length === 0) return DEFAULT_RELAY_STATE
  if (!relayState.startsWith('/') || relayState.startsWith('//')) return DEFAULT_RELAY_STATE
  if (/[\u0000-\u001F\u007F]/u.test(relayState)) return DEFAULT_RELAY_STATE
  return relayState
}
