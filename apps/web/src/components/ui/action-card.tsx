import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function ActionCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        'rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white',
        className,
      )}
    >
      {children}
    </section>
  )
}
