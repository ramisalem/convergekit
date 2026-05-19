'use client'

import { useEffect } from 'react'
import { useUser } from '@/components/user-nav'

/**
 * Client-side guard that redirects non-admin users to the home page.
 * Used as a fallback for pages that should only be accessible to admins.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser()

  useEffect(() => {
    if (!loading && user && user.role !== 'admin') {
      window.location.href = '/'
    }
  }, [user, loading])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="h-8 w-48 animate-pulse rounded bg-secondary" />
      </div>
    )
  }

  if (!user || user.role !== 'admin') return null

  return <>{children}</>
}
