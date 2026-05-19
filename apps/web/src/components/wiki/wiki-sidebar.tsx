'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WikiSection } from '@/lib/api-client'
import { ClientTime } from '@/components/ui/client-time'
import {
  buildInitialOpenSections,
  syncOpenSections,
  toggleOpenSection,
} from '@/components/wiki/wiki-sidebar-state'

interface Props {
  repoName: string
  repositoryId: string
  sections: WikiSection[]
  lastGeneratedAt: string | null
  commitSha: string | null
}

function SectionItem({
  section,
  repositoryId,
  activeSlug,
  locale,
  open,
  onToggle,
}: {
  section: WikiSection
  repositoryId: string
  activeSlug: string
  locale: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-neutral-900 hover:bg-neutral-100 transition-colors"
      >
        {open
          ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-neutral-400" />
          : <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-neutral-400" />}
        <span className="min-w-0 whitespace-normal leading-5">{section.title}</span>
      </button>

      {open && (
        <div className="mt-1 space-y-1 pl-3">
          {section.pages.map((page) => (
            <a
              key={page.slug}
              href={`/${locale}/repositories/${repositoryId}/wiki/${page.slug}`}
              className={cn(
                'flex items-start gap-2 rounded-lg px-3 py-2 text-sm leading-5 transition-colors',
                activeSlug === page.slug
                  ? 'border-l-2 border-neutral-900 bg-neutral-100 pl-2.5 font-medium text-neutral-900'
                  : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900',
                page.status === 'pending' || page.status === 'generating'
                  ? 'opacity-50'
                  : '',
              )}
            >
              <span className="min-w-0 whitespace-normal">{page.title}</span>
              {(page.status === 'pending' || page.status === 'generating') && (
                <span className="ml-auto h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400 animate-pulse" />
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export function WikiSidebar({ repoName, repositoryId, sections, lastGeneratedAt, commitSha }: Props) {
  const pathname = usePathname()
  // Extract locale and slug from path: /en/repositories/:id/wiki/:slug
  const locale = pathname.split('/')[1] ?? 'en'
  const activeSlug = pathname.split('/wiki/')[1] ?? ''
  const initialOpenSections = useMemo(() => buildInitialOpenSections(sections), [sections])
  const [openSections, setOpenSections] = useState(initialOpenSections)

  useEffect(() => {
    setOpenSections((current) => syncOpenSections(current, sections))
  }, [sections])

  return (
    <aside className="flex flex-col gap-4 rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white px-3 py-4">
      {/* Repo + metadata */}
      <div className="border-b border-[var(--convergekit-line-2)] px-1 pb-4">
        <a
          href={`/${locale}/repositories/${repositoryId}`}
          className="block text-sm font-semibold text-neutral-900 hover:underline truncate"
        >
          {repoName}
        </a>
        {lastGeneratedAt && (
          <p className="mt-1 text-xs text-neutral-400">
            Last indexed: <ClientTime iso={lastGeneratedAt} />
            {commitSha && (
              <span className="ml-1 font-mono">({commitSha.slice(0, 7)})</span>
            )}
          </p>
        )}
      </div>

      {/* Navigation */}
      <nav className="space-y-1">
        {sections.map((section) => (
          <SectionItem
            key={section.slug}
            section={section}
            repositoryId={repositoryId}
            activeSlug={activeSlug}
            locale={locale}
            open={openSections[section.slug] ?? true}
            onToggle={() => setOpenSections((current) => toggleOpenSection(current, section.slug))}
          />
        ))}
      </nav>
    </aside>
  )
}
