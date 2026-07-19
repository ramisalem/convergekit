'use client'

import type { ReactNode } from 'react'

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 border-b border-neutral-100 pb-2 text-xs font-semibold uppercase tracking-wide text-neutral-700">
        {title}
      </h3>
      {children}
    </section>
  )
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {hint ? <span className="text-xs text-neutral-500">{hint}</span> : null}
    </div>
  )
}

export function SimpleTable<T>({
  rows,
  columns,
  empty,
}: {
  rows: T[]
  columns: Array<{ header: string; cell: (row: T) => ReactNode; align?: 'left' | 'right' }>
  empty: string
}) {
  if (rows.length === 0) return <p className="text-sm text-neutral-500">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
            {columns.map((col) => (
              <th
                key={col.header}
                className={`py-1.5 font-medium ${col.align === 'right' ? 'text-right' : ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-neutral-100">
              {columns.map((col) => (
                <td
                  key={col.header}
                  className={`py-1.5 tabular-nums ${col.align === 'right' ? 'text-right' : ''}`}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function BarList({ items }: { items: Array<{ label: string; count: number }> }) {
  if (items.length === 0) return <p className="text-sm text-neutral-500">No data in this window.</p>
  const max = Math.max(...items.map((i) => i.count), 1)
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-sm">
          <span className="w-40 shrink-0 truncate" title={item.label}>
            {item.label}
          </span>
          <span className="relative h-4 flex-1 rounded bg-neutral-100">
            <span
              className="absolute inset-y-0 left-0 rounded bg-neutral-800"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </span>
          <span className="w-16 shrink-0 text-right tabular-nums text-neutral-500">
            {item.count.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  )
}
