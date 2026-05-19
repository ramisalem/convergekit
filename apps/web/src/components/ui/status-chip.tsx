import { cn } from '@/lib/utils'

type Status = 'pending' | 'processing' | 'done' | 'failed'

const STATUS_LABELS: Record<Status, string> = {
  pending: 'Pending',
  processing: 'Processing',
  done: 'Indexed',
  failed: 'Failed',
}

const STATUS_CLASS_NAMES: Record<Status, string> = {
  pending:
    'border-[var(--convergekit-line)] bg-[var(--convergekit-bg-3)] text-[var(--convergekit-ink-3)]',
  processing: 'border-amber-200 bg-amber-50 text-amber-800',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
}

export function StatusChip({ status, label }: { status: Status; label?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1 rounded-full border px-2 text-[11.5px] font-medium',
        STATUS_CLASS_NAMES[status],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {label ?? STATUS_LABELS[status]}
    </span>
  )
}
