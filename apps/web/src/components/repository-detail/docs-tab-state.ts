import type { WikiSection } from '@/lib/api-client'
import type { JobProgressStatus } from '@/lib/use-job-progress'

export type DocsPhase = 'indexing' | 'mindmap' | 'wiki' | 'done' | 'failed'

interface DocsTabStateInput {
  initialStatus: 'pending' | 'processing' | 'done' | 'failed'
  queue: string
  jobStatus: JobProgressStatus
  isDocsFollowUpJob: boolean
  wikiSections: WikiSection[] | null
}

function getAllWikiPages(wikiSections: WikiSection[] | null) {
  return (wikiSections ?? []).flatMap((section) => section.pages)
}

function areWikiPagesTerminal(wikiSections: WikiSection[] | null) {
  const pages = getAllWikiPages(wikiSections)
  return pages.length > 0 && pages.every((page) => page.status === 'done' || page.status === 'failed')
}

export function shouldPollWikiPages({
  initialStatus,
  queue,
  jobStatus,
  isDocsFollowUpJob,
}: Pick<DocsTabStateInput, 'initialStatus' | 'queue' | 'jobStatus' | 'isDocsFollowUpJob'>) {
  if (isDocsFollowUpJob) return true
  return initialStatus !== 'done' && (queue === 'wiki-generation' || jobStatus === 'completed')
}

export function getDocsTabPhase({
  initialStatus,
  queue,
  jobStatus,
  isDocsFollowUpJob,
  wikiSections,
}: DocsTabStateInput): DocsPhase {
  if (initialStatus === 'failed') return 'failed'

  if (isDocsFollowUpJob) {
    if (jobStatus === 'failed') return 'done'
    if (areWikiPagesTerminal(wikiSections)) return 'done'
    return getAllWikiPages(wikiSections).length > 0
      ? 'wiki'
      : queue === 'mind-map'
        ? 'mindmap'
        : 'wiki'
  }

  if (jobStatus === 'failed') return 'failed'
  if (initialStatus === 'done') return 'done'
  if (queue === 'wiki-generation') return 'wiki'
  if (jobStatus !== 'completed') return 'indexing'

  const allPages = getAllWikiPages(wikiSections)
  if (allPages.length === 0) return 'mindmap'
  return 'wiki'
}
