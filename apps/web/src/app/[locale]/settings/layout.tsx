import type { ReactNode } from 'react'
import { AdminGuard } from '@/components/admin-guard'

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>
}
