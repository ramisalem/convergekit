'use client'

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { CheckCircle, FileText, Search } from 'lucide-react'
import { CodeBlock } from '@/components/ai-elements/code-block'
import { cn } from '@/lib/utils'
import { useJobProgress } from '@/lib/use-job-progress'
import { documentsApi, wikiApi } from '@/lib/api-client'
import type { DocumentPath, DocumentContent, WikiSection } from '@/lib/api-client'
import { DocumentFileTree } from './document-file-tree'
import { getDocumentCodeLanguage } from './document-code-language'
import { getDocsTabPhase, shouldPollWikiPages, type DocsPhase } from './docs-tab-state'

interface Props {
  repositoryId: string
  status: 'pending' | 'processing' | 'done' | 'failed'
  jobId?: string | null
  queue?: string
}

const CIRCUMFERENCE = 2 * Math.PI * 28

function CircularProgress({
  pct,
  indeterminate = false,
  stalled = false,
  label,
}: {
  pct: number
  indeterminate?: boolean
  stalled?: boolean
  label?: string
}) {
  return (
    <div className="relative flex h-16 w-16 items-center justify-center">
      <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4" className="text-neutral-100" />
        <circle
          cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4"
          className={cn(
            indeterminate && 'animate-spin origin-center',
            stalled ? 'text-amber-400' : 'text-neutral-900 transition-all duration-500',
          )}
          strokeDasharray={indeterminate ? `${CIRCUMFERENCE * 0.25} ${CIRCUMFERENCE * 0.75}` : `${CIRCUMFERENCE}`}
          strokeDashoffset={indeterminate ? 0 : `${CIRCUMFERENCE * (1 - pct / 100)}`}
          strokeLinecap="round"
        />
      </svg>
      {label !== undefined && (
        <span className="text-xs font-semibold tabular-nums">{label}</span>
      )}
    </div>
  )
}

function PhaseSteps({ phase }: { phase: DocsPhase }) {
  const t = useTranslations('repositoryDetail.docs')
  const steps: { key: DocsPhase; label: string }[] = [
    { key: 'indexing', label: t('phaseIndexing') },
    { key: 'mindmap', label: t('phaseMindmap') },
    { key: 'wiki', label: t('phaseWiki') },
  ]
  const order: DocsPhase[] = ['indexing', 'mindmap', 'wiki', 'done']
  const currentIdx = order.indexOf(phase)

  return (
    <div className="flex items-center gap-0 mt-6">
      {steps.map((step, i) => {
        const stepIdx = order.indexOf(step.key)
        const isDone = stepIdx < currentIdx
        const isActive = stepIdx === currentIdx
        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                'h-2 w-2 rounded-full transition-colors',
                isDone ? 'bg-neutral-900' : isActive ? 'bg-neutral-900 animate-pulse' : 'bg-neutral-200',
              )} />
              <span className={cn(
                'text-xs whitespace-nowrap',
                isDone ? 'text-neutral-500' : isActive ? 'text-neutral-900 font-medium' : 'text-neutral-300',
              )}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn(
                'h-px w-8 mb-3 mx-1 transition-colors',
                isDone ? 'bg-neutral-400' : 'bg-neutral-200',
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function DocsTab({ repositoryId, status: initialStatus, jobId, queue = 'repository-analysis' }: Props) {
  const t = useTranslations('repositoryDetail.docs')
  const isDocsFollowUpJob = initialStatus === 'done'
    && Boolean(jobId)
    && (queue === 'wiki-generation' || queue === 'mind-map')
  const { progress, status: jobStatus, error: jobError } = useJobProgress(
    (initialStatus === 'processing' || initialStatus === 'pending' || isDocsFollowUpJob) ? jobId : null,
    queue,
  )

  // Wiki polling state (phases 2 & 3)
  const [wikiSections, setWikiSections] = useState<WikiSection[] | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [docs, setDocs] = useState<DocumentPath[]>([])
  const [docQuery, setDocQuery] = useState('')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedDoc, setSelectedDoc] = useState<DocumentContent | null>(null)
  const [loadingDoc, setLoadingDoc] = useState(false)
  const [docsError, setDocsError] = useState<string | null>(null)

  // Determine current phase
  const phase = getDocsTabPhase({
    initialStatus,
    queue,
    jobStatus,
    isDocsFollowUpJob,
    wikiSections,
  })

  // Start polling wiki pages after SSE job completes.
  // For wiki-only jobs, poll immediately — no indexing/mindmap step to wait for.
  useEffect(() => {
    const shouldPoll = shouldPollWikiPages({
      initialStatus,
      queue,
      jobStatus,
      isDocsFollowUpJob,
    })
    if (!shouldPoll) return

    function poll() {
      wikiApi.getPages(repositoryId)
        .then((data) => setWikiSections(data.sections))
        .catch(() => undefined)
    }
    poll()
    pollRef.current = setInterval(poll, 3_000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [jobStatus, repositoryId, initialStatus, queue])

  // Fetch document list when fully done
  useEffect(() => {
    if (initialStatus !== 'done') return
    documentsApi.list(repositoryId)
      .then(({ documents }) => setDocs(documents))
      .catch(() => setDocsError('Failed to load documents'))
  }, [repositoryId, initialStatus])

  // Fetch content when a path is selected
  useEffect(() => {
    if (!selectedPath) return
    setLoadingDoc(true)
    setSelectedDoc(null)
    documentsApi.getContent(repositoryId, selectedPath)
      .then(({ document }) => setSelectedDoc(document))
      .catch(() => setSelectedDoc(null))
      .finally(() => setLoadingDoc(false))
  }, [repositoryId, selectedPath])

  if (phase === 'failed') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm font-semibold text-red-600">{t('indexingFailed')}</p>
        {jobError && (
          <p className="mt-1 max-w-sm text-xs text-neutral-500">{jobError}</p>
        )}
        <p className="mt-2 text-sm text-neutral-500">{t('indexingFailedDescription')}</p>
      </div>
    )
  }

  if (phase === 'indexing' || phase === 'mindmap' || phase === 'wiki') {
    const stalled = jobStatus === 'stalled'

    // Calculate visual progress and label
    let pct = 0
    let indeterminate = false
    let label: string | undefined
    let description = ''

    if (phase === 'indexing') {
      pct = Math.round(progress / 3) // 0–33%
      label = `${pct}%`
      description = stalled ? t('indexingStalled') : t('indexingDescription')
    } else if (phase === 'mindmap') {
      pct = 33
      indeterminate = true
      label = undefined
      description = t('mindmapDescription')
    } else {
      // wiki phase — progress based on pages done
      const allPages = (wikiSections ?? []).flatMap((s) => s.pages)
      const total = allPages.length
      const done = allPages.filter((p) => p.status === 'done').length
      pct = total > 0 ? 33 + Math.round((done / total) * 67) : 33
      label = total > 0 ? `${done}/${total}` : undefined
      description = t('wikiDescription')
    }

    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <CircularProgress pct={pct} indeterminate={indeterminate} stalled={stalled} label={label} />
        <p className="mt-4 text-sm font-semibold">
          {isDocsFollowUpJob ? t('generatingDocumentation') : t('indexing')}
        </p>
        <p className={cn('mt-1 text-xs', stalled ? 'text-amber-600' : 'text-neutral-500')}>
          {description}
        </p>
        <PhaseSteps phase={phase} />
      </div>
    )
  }

  const wikiBanner = isDocsFollowUpJob
    ? jobStatus === 'failed'
      ? {
          tone: 'border-amber-200 bg-amber-50 text-amber-900',
          title: t('wikiRegenerationFailed'),
          description: jobError ?? t('wikiRegenerationFailedDescription'),
        }
      : phase === 'done'
        ? {
            tone: 'border-green-200 bg-green-50 text-green-900',
            title: t('wikiRegenerationComplete'),
            description: t('wikiRegenerationCompleteDescription'),
          }
        : {
            tone: jobStatus === 'stalled'
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-blue-200 bg-blue-50 text-blue-900',
            title: jobStatus === 'stalled'
              ? t('wikiRegenerationStalled')
              : t('wikiRegenerationInProgress'),
            description: jobStatus === 'stalled'
              ? t('wikiRegenerationStalledDescription')
              : t('wikiRegenerationProgress', { progress }),
          }
    : null
  const selectedDocLanguage = selectedDoc
    ? getDocumentCodeLanguage({
        path: selectedDoc.path,
        programmingLanguage: selectedDoc.programmingLanguage,
      })
    : null

  // status === 'done' — doc browser
  return (
    <div
      className="file-structure-pane-grid grid h-[calc(100vh_-_16rem)] min-h-[640px] w-full min-w-0 overflow-hidden border-b border-[var(--convergekit-line)] bg-[var(--convergekit-bg)]"
      style={{ gridTemplateColumns: '320px minmax(0,1fr)' }}
    >
      <aside className="file-structure-rail flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-[var(--convergekit-line)] bg-white px-[14px] py-4">
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--convergekit-ink-4)]">
          {t('documents')}
        </p>
        <label className="relative mb-2 block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--convergekit-ink-4)]" />
          <input
            value={docQuery}
            onChange={(event) => setDocQuery(event.target.value)}
            placeholder="Search files"
            className="h-8 w-full rounded-md border border-[var(--convergekit-line)] bg-white pl-8 pr-2 text-xs text-[var(--convergekit-ink)] outline-none focus:border-[var(--convergekit-focus)]"
          />
        </label>
        {docsError ? (
          <p className="px-2 text-xs text-red-500">{docsError}</p>
        ) : docs.length === 0 ? (
          <p className="px-2 text-xs text-[var(--convergekit-ink-4)]">{t('noDocuments')}</p>
        ) : (
          <DocumentFileTree
            documents={docs}
            query={docQuery}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
          />
        )}
      </aside>

      <div className="file-structure-center-column flex h-full min-h-0 min-w-0 justify-center overflow-hidden px-5 py-4">
        <div className="flex h-full min-h-0 w-full max-w-[64rem] flex-col gap-3 overflow-hidden">
          {wikiBanner && (
            <div className={cn('shrink-0 rounded-[var(--convergekit-radius-lg)] border px-4 py-3', wikiBanner.tone)}>
              <p className="text-sm font-semibold">{wikiBanner.title}</p>
              <p className="mt-1 text-sm opacity-90">{wikiBanner.description}</p>
            </div>
          )}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--convergekit-radius-md)] border border-[var(--convergekit-line)] bg-white">
            {!selectedPath && (
              <div className="flex items-center gap-2 border-b border-[var(--convergekit-line-2)] bg-green-50 px-4 py-2.5 text-sm text-green-700">
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
                {t('indexingComplete')}
              </div>
            )}

            {!selectedPath ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
                <FileText className="mb-3 h-8 w-8 text-[var(--convergekit-line-strong)]" />
                <p className="text-sm text-[var(--convergekit-ink-3)]">{t('selectDocument')}</p>
              </div>
            ) : loadingDoc ? (
              <div className="flex flex-1 items-center justify-center py-20">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-600" />
              </div>
            ) : selectedDoc ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex items-center gap-2 border-b border-[var(--convergekit-line-2)] px-4 py-2.5">
                  <FileText className="h-4 w-4 flex-shrink-0 text-[var(--convergekit-ink-4)]" />
                  <span className="truncate text-sm font-medium text-[var(--convergekit-ink-2)]">{selectedDoc.path}</span>
                  {selectedDoc.programmingLanguage && (
                    <span className="ml-auto flex-shrink-0 rounded border border-[var(--convergekit-line)] bg-[var(--convergekit-bg-3)] px-2 py-0.5 text-xs text-[var(--convergekit-ink-4)]">
                      {selectedDoc.programmingLanguage}
                    </span>
                  )}
                </div>
                {selectedDocLanguage ? (
                  <CodeBlock
                    className="document-code-viewer flex-1 rounded-none border-0 bg-[var(--convergekit-bg)]"
                    code={selectedDoc.content}
                    language={selectedDocLanguage}
                    showLineNumbers
                  />
                ) : (
                  <pre className="document-raw-viewer flex-1 overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-xs leading-relaxed text-[var(--convergekit-ink-2)]">
                    {selectedDoc.content}
                  </pre>
                )}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center py-20">
                <p className="text-sm text-[var(--convergekit-ink-3)]">Failed to load document</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
