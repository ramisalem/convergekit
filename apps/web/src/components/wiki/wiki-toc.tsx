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
      className="wiki-page-toc"
    >
      <p className="label-eyebrow mb-3">
        On this page
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' })
                setActiveId(item.id)
              }}
              className={cn(
                'block border-l-2 py-0.5 text-[12.5px] leading-5 transition-colors',
                item.level === 3 ? 'pl-3.5' : 'pl-2',
                activeId === item.id
                  ? 'border-[var(--convergekit-ink)] font-semibold text-[var(--convergekit-ink)]'
                  : 'border-transparent font-normal text-[var(--convergekit-ink-3)] hover:text-[var(--convergekit-ink)]',
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
