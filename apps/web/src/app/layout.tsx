import type { ReactNode } from 'react'
import './globals.css'

export const metadata = {
  title: { default: 'ConvergeKit', template: '%s | ConvergeKit' },
  description: 'The shared source of truth for product, engineering, and AI agents.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
