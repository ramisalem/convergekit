'use client'

import { useState } from 'react'
import { Github } from 'lucide-react'
import { getApiBaseUrl, getWebBaseUrl } from '@/lib/runtime-urls'

const API_URL = getApiBaseUrl()
const WEB_URL = getWebBaseUrl()

export function GitHubSignInButton({ label }: { label: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/auth/sign-in/social`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'github',
          callbackURL: `${WEB_URL}/en/repositories`,
        }),
      })
      const data = await res.json()
      if (data?.url) {
        window.location.href = data.url
      } else {
        setError('Failed to start sign-in. Please try again.')
        setLoading(false)
      }
    } catch {
      setError('Network error. Make sure the API is running.')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex h-10 w-full items-center justify-center gap-2.5 rounded-md border border-[var(--convergekit-ink)] bg-[var(--convergekit-ink)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <Github className="h-4 w-4" />
        {loading ? 'Redirecting to GitHub…' : label}
      </button>
      {error && <p className="text-center text-xs text-red-600">{error}</p>}
    </div>
  )
}
