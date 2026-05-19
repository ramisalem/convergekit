'use client'

import { useMemo, useState } from 'react'

export type MultiSelectOption = { id: string; label: string; subLabel?: string }

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Search…',
  emptyLabel = 'No options',
}: {
  options: MultiSelectOption[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  placeholder?: string
  emptyLabel?: string
}) {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return options
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(needle) || o.subLabel?.toLowerCase().includes(needle),
    )
  }, [q, options])

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-neutral-200 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
      />
      <div className="max-h-64 overflow-y-auto rounded-md border border-neutral-200">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-neutral-500">{emptyLabel}</div>
        ) : (
          filtered.map((o) => (
            <label
              key={o.id}
              className="flex cursor-pointer items-center gap-3 border-b border-neutral-100 px-3 py-2 last:border-b-0 hover:bg-neutral-50"
            >
              <input
                type="checkbox"
                checked={selected.has(o.id)}
                onChange={() => toggle(o.id)}
                className="h-4 w-4"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium">{o.label}</span>
                {o.subLabel && <span className="block text-xs text-neutral-500">{o.subLabel}</span>}
              </span>
            </label>
          ))
        )}
      </div>
      <div className="text-xs text-neutral-500">{selected.size} selected</div>
    </div>
  )
}
