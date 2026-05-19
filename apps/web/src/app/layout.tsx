import type { ReactNode } from 'react'
import './globals.css'

export const metadata = {
  title: { default: 'ConvergeKit', template: '%s | ConvergeKit' },
  description:
    'Bring product intent, code reality, and agent context together for software teams.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
