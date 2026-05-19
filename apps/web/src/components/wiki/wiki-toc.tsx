'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface TocItem {
  id: string
  text: string
  level: number
}

interface Props {
  contentSelector?: string
}

export function WikiToc({ contentSelector = '[data-wiki-content]' }: Props) {
  const [items, setItems] = useState<TocItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    const container = document.querySelector(contentSelector)
    if (!container) return

    const headings = Array.from(container.querySelectorAll('h2, h3')) as HTMLHeadingElement[]
    const tocItems: TocItem[] = headings.map((h, i) => {
      if (!h.id) h.id = `heading-${i}`
      return { id: h.id, text: h.textContent ?? '', level: parseInt(h.tagName[1]) }
    })
    setItems(tocItems)
  }, [contentSelector])

  useEffect(() => {
    if (items.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        }
      },
      { rootMargin: '0px 0px -70% 0px', threshold: 0.1 },
    )

    items.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [items])

  if (items.length === 0) return null

  return (
    <nav
      aria-label="On this page"
      className="rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white px-4 py-4"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--convergekit-ink-4)]">
        On this page
      </p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} style={{ paddingLeft: item.level === 3 ? '0.75rem' : '0' }}>
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' })
                setActiveId(item.id)
              }}
              className={cn(
                'block text-sm leading-5 transition-colors',
                activeId === item.id
                  ? 'font-medium text-[var(--convergekit-ink)]'
                  : 'text-[var(--convergekit-ink-3)] hover:text-[var(--convergekit-ink)]',
              )}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
