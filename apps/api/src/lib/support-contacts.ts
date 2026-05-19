import type { AccessPolicyConfig } from '@convergekit/config/access-policy'
import { accessPolicyConfig, isAllowedAccessPolicyEmail } from '@convergekit/config/access-policy'

export type SupportContact = {
  name: string
  email: string
}

export function buildSupportContacts(input: {
  activeAdmins: SupportContact[]
  fallbackEmails: string[]
  accessPolicy?: AccessPolicyConfig
}): SupportContact[] {
  const policy = input.accessPolicy ?? accessPolicyConfig

  // Defense-in-depth: never expose admins or fallback contacts whose email is outside the access
  // policy, even if a stale row predates the policy. Stops historical seed/test admins from
  // leaking into every non-admin user's empty-state UI.
  const policyAdmins = input.activeAdmins.filter((admin) =>
    isAllowedAccessPolicyEmail(admin.email, policy),
  )
  if (policyAdmins.length > 0) return policyAdmins

  return input.fallbackEmails
    .filter((email) => isAllowedAccessPolicyEmail(email, policy))
    .map((email) => ({ name: email, email }))
}
