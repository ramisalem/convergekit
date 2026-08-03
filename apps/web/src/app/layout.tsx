import type { ReactNode } from 'react'
import './globals.css'

export const metadata = {
  title: { default: 'Colab Ai Hub', template: '%s | Colab Ai Hub' },
  description: 'The shared source of truth for product, engineering, and AI agents.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
