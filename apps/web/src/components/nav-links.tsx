'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <>
      {items.map(({ href, label }) => {
        // Match /en/repositories as active for href=/repositories
        const active = pathname.includes(href)
        return (
          <a
            key={href}
            href={href}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-[var(--convergekit-bg-3)] text-[var(--convergekit-ink)]'
                : 'text-[var(--convergekit-ink-3)] hover:bg-[var(--convergekit-bg-3)] hover:text-[var(--convergekit-ink)]',
            )}
          >
            {label}
          </a>
        )
      })}
    </>
  )
}
