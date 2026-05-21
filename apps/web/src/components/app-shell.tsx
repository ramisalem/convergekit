import { AdminNavLinks } from '@/components/admin-nav-links'
import { NavLinks } from '@/components/nav-links'
import { UserNav } from '@/components/user-nav'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations('nav')

  return (
    <div className="relative flex min-h-screen flex-col bg-[var(--convergekit-bg-2)]">
      <header className="sticky top-0 z-50 h-[52px] border-b border-[var(--convergekit-line)] bg-white">
        <div className="app-shell-header-inner flex h-full w-full items-center justify-between px-5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-5">
            <a
              href="/"
              className="flex items-center gap-2.5 text-sm font-semibold text-[var(--convergekit-ink)]"
            >
              <span className="grid h-6 w-6 place-items-center rounded-md bg-[var(--convergekit-ink)] text-[10px] font-bold text-white">
                CK
              </span>
              <span>{t('brand')}</span>
            </a>
            <nav className="flex items-center gap-1">
              <NavLinks items={[{ href: '/repositories', label: t('repositories') }]} />
              <AdminNavLinks settingsLabel={t('settings')} />
            </nav>
          </div>
          <UserNav />
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  )
}
