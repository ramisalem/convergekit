import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tier = 'A' | 'B' | 'C' | 'D'
type Alignment = 'ok' | 'stale' | 'conflict'

const TIER_CLASS_NAMES: Record<Tier, string> = {
  A: 'border-[var(--convergekit-auth-a-bd)]/25 bg-[var(--convergekit-auth-a-bg)] text-[var(--convergekit-auth-a-fg)]',
  B: 'border-[var(--convergekit-auth-b-bd)]/25 bg-[var(--convergekit-auth-b-bg)] text-[var(--convergekit-auth-b-fg)]',
  C: 'border-[var(--convergekit-auth-c-bd)]/25 bg-[var(--convergekit-auth-c-bg)] text-[var(--convergekit-auth-c-fg)]',
  D: 'border-[var(--convergekit-auth-d-bd)]/25 bg-[var(--convergekit-auth-d-bg)] text-[var(--convergekit-auth-d-fg)]',
}

const ALIGNMENT_CLASS_NAMES: Record<Alignment, string> = {
  ok: 'border-[var(--convergekit-align-ok-bd)]/25 bg-[var(--convergekit-align-ok-bg)] text-[var(--convergekit-align-ok-fg)]',
  stale:
    'border-[var(--convergekit-align-stale-bd)]/25 bg-[var(--convergekit-align-stale-bg)] text-[var(--convergekit-align-stale-fg)]',
  conflict:
    'border-[var(--convergekit-align-conflict-bd)]/25 bg-[var(--convergekit-align-conflict-bg)] text-[var(--convergekit-align-conflict-fg)]',
}

export function EvidenceChip({ tier, children }: { tier: Tier; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11.5px] font-medium',
        TIER_CLASS_NAMES[tier],
      )}
    >
      {children}
    </span>
  )
}

export function AlignmentChip({
  alignment,
  children,
}: {
  alignment: Alignment
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11.5px] font-medium',
        ALIGNMENT_CLASS_NAMES[alignment],
      )}
    >
      {children}
    </span>
  )
}

export function EvidenceBar({ tier, children }: { tier: Tier; children: ReactNode }) {
  const borderColor = {
    A: 'border-[var(--convergekit-auth-a-bd)]',
    B: 'border-[var(--convergekit-auth-b-bd)]',
    C: 'border-[var(--convergekit-auth-c-bd)]',
    D: 'border-[var(--convergekit-auth-d-bd)]',
  }[tier]

  return (
    <div
      className={cn(
        'flex items-center gap-2 border-l-2 bg-transparent pl-2 text-xs text-[var(--convergekit-ink-2)]',
        borderColor,
      )}
    >
      {children}
    </div>
  )
}

export function StackedTierBar({ tiers }: { tiers: Partial<Record<Tier, number>> }) {
  const total = Object.values(tiers).reduce((sum, value) => sum + (value ?? 0), 0)
  if (!total) return <div className="h-1.5 rounded-full bg-[var(--convergekit-bg-3)]" />

  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-[var(--convergekit-bg-3)]">
      {(['A', 'B', 'C', 'D'] as const).map((tier) => {
        const value = tiers[tier] ?? 0
        if (!value) return null
        return (
          <span
            key={tier}
            className={{
              A: 'bg-[var(--convergekit-auth-a-bd)]',
              B: 'bg-[var(--convergekit-auth-b-bd)]',
              C: 'bg-[var(--convergekit-auth-c-bd)]',
              D: 'bg-[var(--convergekit-auth-d-bd)]',
            }[tier]}
            style={{ width: `${(value / total) * 100}%` }}
          />
        )
      })}
    </div>
  )
}
