'use client'

import { NavLinks } from '@/components/nav-links'
import { useUser } from '@/components/user-nav'
import { factoryApi } from '@/lib/api-client'
import { useEffect, useState } from 'react'

/** Shows the Factory link to signed-in users when the module is turned on (the API answers). */
export function FactoryNavLink({ label }: { label: string }) {
  const { user } = useUser()
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (!user) return
    let active = true
    factoryApi
      .me()
      .then(() => active && setEnabled(true))
      .catch(() => active && setEnabled(false))
    return () => {
      active = false
    }
  }, [user])

  if (!user || !enabled) return null
  return <NavLinks items={[{ href: '/factory', label }]} />
}
