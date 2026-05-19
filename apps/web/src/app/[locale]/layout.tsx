import type { ReactNode } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { RootProvider } from 'fumadocs-ui/provider'
import { AppShell } from '@/components/app-shell'
import { UserProvider } from '@/components/user-nav'

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!routing.locales.includes(locale as 'en')) notFound()
  const messages = await getMessages()

  return (
    <NextIntlClientProvider messages={messages}>
      <RootProvider theme={{ defaultTheme: 'light', forcedTheme: 'light' }}>
        <UserProvider>
          <AppShell>{children}</AppShell>
        </UserProvider>
      </RootProvider>
    </NextIntlClientProvider>
  )
}
