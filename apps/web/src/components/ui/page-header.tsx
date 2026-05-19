import type { ReactNode } from 'react'

export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--convergekit-ink-4)]">
            {eyebrow}
          </div>
        )}
        <h1 className="m-0 truncate text-[26px] font-semibold leading-tight text-[var(--convergekit-ink)]">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 text-[13.5px] leading-5 text-[var(--convergekit-ink-3)]">
            {description}
          </p>
        )}
        {meta && <div className="mt-2 text-[12.5px] text-[var(--convergekit-ink-3)]">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
