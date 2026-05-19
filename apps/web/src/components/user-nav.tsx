'use client'

import { SignOutButton } from '@/components/sign-out-button'
import { meApi, type SupportContact } from '@/lib/api-client'
import { getApiBaseUrl } from '@/lib/runtime-urls'
import { useTranslations } from 'next-intl'
import { createContext, useContext, useEffect, useState } from 'react'

const API_URL = getApiBaseUrl()

type UserData = {
  id: string
  name: string
  email: string
  image?: string | null
  role: 'admin' | 'user'
  groupId: string | null
  supportContacts: SupportContact[]
} | null

type UserContextType = { user: UserData; loading: boolean }

const UserContext = createContext<UserContextType>({ user: null, loading: true })

export function useUser() {
  return useContext(UserContext)
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_URL}/api/auth/get-session`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then(async (session) => {
        if (!session?.user?.id) {
          setUser(null)
          return
        }
        // Fetch full user profile with role from /api/me
        try {
          const { user: meUser, supportContacts } = await meApi.get()
          setUser({ ...meUser, supportContacts: supportContacts ?? [] })
        } catch {
          setUser(null)
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  return <UserContext.Provider value={{ user, loading }}>{children}</UserContext.Provider>
}

export function UserNav() {
  const t = useTranslations('nav')
  const { user, loading } = useUser()

  if (loading) {
    return <div className="h-7 w-16 animate-pulse rounded-md bg-[var(--convergekit-bg-3)]" />
  }

  if (!user) {
    return (
      <a
        href="/auth/sign-in"
        className="rounded-md bg-[var(--convergekit-ink)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
      >
        {t('signIn')}
      </a>
    )
  }

  const initial = (user.name?.[0] ?? user.email?.[0] ?? '?').toUpperCase()
  const profileContent = (
    <>
      {user.image ? (
        <img
          src={user.image}
          alt={user.name}
          className="h-7 w-7 rounded-full object-cover ring-1 ring-[var(--convergekit-line)]"
        />
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--convergekit-ink)] text-xs font-semibold text-white">
          {initial}
        </div>
      )}
      <span className="hidden text-sm font-medium text-[var(--convergekit-ink)] sm:block">
        {user.name}
      </span>
    </>
  )

  return (
    <div className="flex items-center gap-1">
      {user.role === 'admin' ? (
        <a
          href="/settings"
          className="flex items-center gap-2.5 rounded-md px-2 py-1 transition-colors hover:bg-[var(--convergekit-bg-3)]"
        >
          {profileContent}
        </a>
      ) : (
        <div className="flex items-center gap-2.5 rounded-md px-2 py-1">{profileContent}</div>
      )}
      <SignOutButton label={t('signOut')} variant="icon" />
    </div>
  )
}
