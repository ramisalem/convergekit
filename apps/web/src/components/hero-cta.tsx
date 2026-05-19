'use client'

import { useState, useEffect } from 'react'
import { getApiBaseUrl } from '@/lib/runtime-urls'

const API_URL = getApiBaseUrl()

export function HeroCta({ getStarted, signIn }: { getStarted: string; signIn: string }) {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/api/auth/get-session`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setLoggedIn(!!data?.user))
      .catch(() => setLoggedIn(false))
  }, [])

  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
      <a
        href="/repositories"
        className="rounded-md bg-[var(--convergekit-ink)] px-[18px] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        {getStarted}
      </a>
      {loggedIn === false && (
        <a
          href="/auth/sign-in"
          className="rounded-md border border-[var(--convergekit-line)] bg-white px-[18px] py-2.5 text-sm font-semibold text-[var(--convergekit-ink-2)] transition-colors hover:bg-[var(--convergekit-bg-3)]"
        >
          {signIn}
        </a>
      )}
    </div>
  )
}
