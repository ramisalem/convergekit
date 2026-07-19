'use client'

import { clearRepositoryCache } from '@/lib/repository-cache'
import { LogOut } from 'lucide-react'
import { useState } from 'react'

export function SignOutButton({
  label,
  variant = 'text',
}: {
  label: string
  variant?: 'text' | 'icon'
}) {
  const [loading, setLoading] = useState(false)

  async function handleSignOut() {
    setLoading(true)

    await fetch('/api/auth/sign-out', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => undefined)

    clearRepositoryCache()
    window.location.href = '/auth/sign-in'
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={loading}
        aria-label={label}
        title={label}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-900 disabled:opacity-60"
      >
        <LogOut className="h-4 w-4" />
        <span className="sr-only">{label}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      disabled={loading}
      className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition-colors disabled:opacity-60"
    >
      {loading ? 'Signing out…' : label}
    </button>
  )
}
