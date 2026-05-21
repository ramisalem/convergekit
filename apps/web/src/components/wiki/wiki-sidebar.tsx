'use client'

import { usePathname } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WikiSection } from '@/lib/api-client'
import { ClientTime } from '@/components/ui/client-time'

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
}: {
  section: WikiSection
  repositoryId: string
  activeSlug: string
  locale: string
}) {
  return (
    <div className="mb-3.5">
      <div className="label-eyebrow mb-1.5 px-2 text-[10.5px]">{section.title}</div>
      <div className="flex flex-col gap-px">
        {section.pages.map((page) => {
          const isGenerating = page.status === 'pending' || page.status === 'generating'

          return (
            <a
              key={page.slug}
              href={`/${locale}/repositories/${repositoryId}/wiki/${page.slug}`}
              className={cn(
                'flex min-w-0 items-center gap-1.5 rounded-[5px] px-2 py-[5px] text-[13px] leading-5 transition-colors',
                activeSlug === page.slug
                  ? 'bg-[var(--convergekit-bg-3)] font-semibold text-[var(--convergekit-ink)]'
                  : isGenerating
                    ? 'text-[var(--convergekit-ink-4)]'
                    : 'text-[var(--convergekit-ink-2)] hover:bg-[var(--convergekit-bg-3)] hover:text-[var(--convergekit-ink)]',
              )}
            >
              <span className="min-w-0 flex-1 truncate">{page.title}</span>
              {isGenerating && (
                <span className="ml-auto rounded-full bg-[var(--convergekit-bg-3)] px-1.5 py-px text-[10px] font-normal text-[var(--convergekit-ink-4)]">
                  generating
                </span>
              )}
            </a>
          )
        })}
      </div>
    </div>
  )
}

export function WikiSidebar({ repoName, repositoryId, sections, lastGeneratedAt, commitSha }: Props) {
  const pathname = usePathname()
  // Extract locale and slug from path: /en/repositories/:id/wiki/:slug
  const locale = pathname.split('/')[1] ?? 'en'
  const activeSlug = pathname.split('/wiki/')[1] ?? ''

  return (
    <nav className="flex flex-col">
      <div className="mb-3.5 border-b border-[var(--convergekit-line-2)] pb-3">
        <a
          href={`/${locale}/repositories/${repositoryId}`}
          className="jw-back mb-3 flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-[var(--convergekit-ink-2)] hover:text-[var(--convergekit-ink)]"
        >
          <ChevronLeft className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{repoName}</span>
        </a>
        {lastGeneratedAt && (
          <p className="text-[11px] text-[var(--convergekit-ink-4)]">
            Indexed <ClientTime iso={lastGeneratedAt} />
            {commitSha && (
              <span className="ml-1 font-mono">· {commitSha.slice(0, 7)}</span>
            )}
          </p>
        )}
      </div>

      <div>
        {sections.map((section) => (
          <SectionItem
            key={section.slug}
            section={section}
            repositoryId={repositoryId}
            activeSlug={activeSlug}
            locale={locale}
          />
        ))}
      </div>
    </nav>
  )
}
