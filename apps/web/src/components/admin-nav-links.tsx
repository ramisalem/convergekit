'use client'

import { useUser } from '@/components/user-nav'
import { NavLinks } from '@/components/nav-links'

export function AdminNavLinks({ settingsLabel }: { settingsLabel: string }) {
  const { user } = useUser()

  if (user?.role !== 'admin') return null

  return <NavLinks items={[{ href: '/settings', label: settingsLabel }]} />
}
