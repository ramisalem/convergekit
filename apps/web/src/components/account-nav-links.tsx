'use client'

import { NavLinks } from '@/components/nav-links'
import { useUser } from '@/components/user-nav'

export function AccountNavLinks({
  connectedAgentsLabel,
  ciTokensLabel,
}: {
  connectedAgentsLabel: string
  ciTokensLabel: string
}) {
  const { user } = useUser()

  if (!user) return null

  return (
    <NavLinks
      items={[
        { href: '/account/agents', label: connectedAgentsLabel },
        { href: '/account/ci-tokens', label: ciTokensLabel },
      ]}
    />
  )
}
