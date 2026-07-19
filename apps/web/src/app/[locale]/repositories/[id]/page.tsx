'use client'

import {
  getAvailableRepositoryTabs,
  getEffectiveRepositoryTab,
  normalizeRepositoryTab,
  type RepositoryTab,
} from '@/components/repository-detail/repository-tabs-state'
import { formatHeaderIncrementalStrip } from '@/components/repository-detail/incremental-freshness'
import { ClientTime } from '@/components/ui/client-time'
import { StatusChip } from '@/components/ui/status-chip'
import { useUser } from '@/components/user-nav'
import { ApiError, fetchRepositoryDetailRecord, repositoriesApi } from '@/lib/api-client'
import { markPerf } from '@/lib/perf-marks'
import { trackRepositoryDetailEvent } from '@/lib/repository-analytics'
import {
  fetchRepositoryDetail,
  getRepository,
  loadSessionMirror,
  removeRepository,
  setRepositoryCacheOwner,
} from '@/lib/repository-cache'
import { cn } from '@/lib/utils'
import type { RepositoryResponse } from '@convergekit/types'
import { AlertTriangle, ArrowLeft, BookOpen, GitBranch, RefreshCw } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { use, useCallback, useEffect, useRef, useState, useTransition } from 'react'

interface Props {
  params: Promise<{ id: string }>
}

const DocsTab = dynamic(
  () => import('@/components/repository-detail/docs-tab').then((module) => module.DocsTab),
  { loading: () => <RepositoryTabSkeleton /> },
)

const RepoGuideTab = dynamic(
  () =>
    import('@/components/repository-detail/repo-guide-tab').then((module) => module.RepoGuideTab),
  { loading: () => <RepositoryTabSkeleton /> },
)

const ChatTab = dynamic(
  () => import('@/components/repository-detail/chat-tab').then((module) => module.ChatTab),
  { loading: () => <RepositoryTabSkeleton /> },
)

const SettingsTab = dynamic(
  () => import('@/components/repository-detail/settings-tab').then((module) => module.SettingsTab),
  { loading: () => <RepositoryTabSkeleton /> },
)

function RepositoryTabSkeleton() {
  return (
    <div className="p-6">
      <div className="h-5 w-40 animate-pulse rounded bg-[var(--convergekit-bg-3)]" />
      <div className="mt-4 h-32 animate-pulse rounded-[var(--convergekit-radius-lg)] bg-[var(--convergekit-bg-3)]" />
    </div>
  )
}

export default function RepositoryDetailPage({ params }: Props) {
  const { id } = use(params)
  const { user, loading: userLoading } = useUser()
  const { locale } = useParams<{ locale: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const jobId = searchParams.get('jobId')
  const queue = searchParams.get('queue') ?? 'repository-analysis'
  const tabParam = searchParams.get('tab')
  const t = useTranslations('repositoryDetail')
  const [activeTab, setActiveTab] = useState<RepositoryTab>(() => normalizeRepositoryTab(tabParam))
  const [repo, setRepo] = useState<RepositoryResponse | null>(() => getRepository(id))
  const [loading, setLoading] = useState(() => getRepository(id) === null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const refreshRepository = useCallback(
    (options: { force?: boolean } = {}) =>
      fetchRepositoryDetail(id, fetchRepositoryDetailRecord, options),
    [id],
  )
  const [isReindexing, startReindexTransition] = useTransition()
  const landingTracked = useRef(false)
  const guideImpressionTrackedFor = useRef<string | null>(null)
  const advancedSettingsTrackedFor = useRef<string | null>(null)

  useEffect(() => {
    setActiveTab(normalizeRepositoryTab(tabParam))
  }, [tabParam])

  useEffect(() => {
    landingTracked.current = false
    guideImpressionTrackedFor.current = null
    advancedSettingsTrackedFor.current = null
  }, [id])

  useEffect(() => {
    if (userLoading) return
    if (!user) {
      setRepo(null)
      setLoading(false)
      router.replace('/auth/sign-in')
      return
    }
    setRepositoryCacheOwner(user.id)
    markPerf('repository-detail:mount')
    let cancelled = false
    let cachedRepository = getRepository(id)
    if (cachedRepository === null) {
      loadSessionMirror()
      const mirroredRepository = getRepository(id)
      if (mirroredRepository) {
        cachedRepository = mirroredRepository
        setRepo(mirroredRepository)
      }
    }

    if (cachedRepository === null) {
      setRepo(null)
      setLoading(true)
    } else {
      setRepo(cachedRepository)
      setLoading(false)
      markPerf('repository-detail:paint-cached')
    }
    setLoadError(null)
    // Force a fresh fetch when a job id is present (e.g. a just-queued reindex
    // from the settings tab) so a stale "done" status does not stick.
    refreshRepository({ force: Boolean(jobId) })
      .then((repository) => {
        if (cancelled) return
        setRepo(repository)
        markPerf('repository-detail:fresh')
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 404) {
          removeRepository(id)
          setRepo(null)
          setLoadError('Repository not found')
          return
        }
        if (err instanceof ApiError && err.status === 401) {
          setLoadError('Redirecting to sign in…')
          router.replace('/auth/sign-in')
          return
        }
        // Preserve cached data on a failed background refresh.
        if (getRepository(id) === null) {
          setLoadError(
            err instanceof ApiError && err.status === 404
              ? 'Repository not found'
              : 'Failed to load repository',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, jobId, refreshRepository, router, user, userLoading])

  // Poll while processing so the UI catches completion/failure even if SSE stalls
  useEffect(() => {
    const shouldPoll =
      repo?.status === 'pending' ||
      repo?.status === 'processing' ||
      (Boolean(repo?.indexedAt) && queue !== 'repository-analysis')
    if (!shouldPoll) return

    const interval = setInterval(() => {
      refreshRepository({ force: true })
        .then((repository) => setRepo(repository))
        .catch((err) => {
          if (err instanceof ApiError && err.status === 401) router.replace('/auth/sign-in')
        })
    }, 4_000)
    return () => clearInterval(interval)
  }, [queue, refreshRepository, repo?.indexedAt, repo?.status, router])

  // While loading, infer status from jobId presence
  const rawStatus = repo?.status ?? (jobId ? 'processing' : 'pending')
  const hasIndexedCore = Boolean(repo?.indexedAt)
  const isDocsFollowUpJob = Boolean(jobId) && (queue === 'mind-map' || queue === 'wiki-generation')
  const status =
    (hasIndexedCore && isDocsFollowUpJob) || (!jobId && hasIndexedCore && rawStatus !== 'failed')
      ? 'done'
      : rawStatus
  const name = repo?.name ?? id
  const provider = repo?.provider ?? 'github'
  const isAdmin = user?.role === 'admin'
  const availableTabs = getAvailableRepositoryTabs(isAdmin)
  const effectiveActiveTab = getEffectiveRepositoryTab(activeTab, isAdmin)
  const embeddingCompatibility = repo?.embeddingCompatibility ?? null
  const embeddingProfile = repo?.embeddingProfile ?? null

  useEffect(() => {
    if (!repo) return

    if (!landingTracked.current) {
      landingTracked.current = true
      trackRepositoryDetailEvent({
        name: 'repository_landing',
        repositoryId: id,
        tab: effectiveActiveTab,
      })
    }

    if (effectiveActiveTab === 'guide' && guideImpressionTrackedFor.current !== id) {
      guideImpressionTrackedFor.current = id
      trackRepositoryDetailEvent({
        name: 'repo_guide_impression',
        repositoryId: id,
        tab: 'guide',
      })
    }

    if (effectiveActiveTab === 'settings' && advancedSettingsTrackedFor.current !== id) {
      advancedSettingsTrackedFor.current = id
      trackRepositoryDetailEvent({
        name: 'repository_advanced_settings_open',
        repositoryId: id,
        tab: 'settings',
      })
    }
  }, [effectiveActiveTab, id, repo])

  function handleReindex() {
    startReindexTransition(async () => {
      try {
        const { jobId: nextJobId } = await repositoriesApi.reindex(id)
        setRepo((current) =>
          current
            ? {
                ...current,
                status: 'pending',
                embeddingCompatibility: null,
              }
            : current,
        )
        router.push(`/${locale}/repositories/${id}?jobId=${nextJobId}&tab=docs`)
      } catch {
        // Keep the warning visible so the user can retry.
      }
    })
  }

  if (!repo && loading) {
    return (
      <div className="mx-auto max-w-[1500px] px-5 py-8">
        <div className="h-5 w-40 animate-pulse rounded bg-[var(--convergekit-bg-3)]" />
        <div className="mt-6 h-8 w-64 animate-pulse rounded bg-[var(--convergekit-bg-3)]" />
        <div className="mt-8 h-48 animate-pulse rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-[1500px] px-5 py-8">
        <Link
          href={`/${locale}/repositories`}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--convergekit-ink-3)] transition-colors hover:text-[var(--convergekit-ink)]"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('backToRepositories')}
        </Link>
        <div className="mt-10 rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white px-6 py-10 text-center">
          <p className="text-sm text-[var(--convergekit-ink-3)]">{loadError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="repository-detail-workspace-frame mx-auto w-full max-w-[1500px] px-5 py-8">
      <div className="repository-detail-chrome">
        {/* Breadcrumb */}
        <Link
          href={`/${locale}/repositories`}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--convergekit-ink-3)] transition-colors hover:text-[var(--convergekit-ink)]"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('backToRepositories')}
        </Link>

        {/* Header */}
        <div className="repository-detail-header-grid mt-4 grid w-full items-start gap-4 text-left">
          <div className="min-w-0 justify-self-start">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-md border border-[var(--convergekit-line)] bg-white">
                <GitBranch className="h-4 w-4 text-[var(--convergekit-ink-3)]" />
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h1 className="m-0 truncate text-[26px] font-semibold leading-tight text-[var(--convergekit-ink)]">
                    {name}
                  </h1>
                  <StatusChip status={status as RepositoryResponse['status']} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--convergekit-ink-3)]">
                  <span className="capitalize">{provider}</span>
                  <span className="font-mono">{repo?.defaultBranch ?? 'main'}</span>
                  <span>
                    Last indexed:{' '}
                    <ClientTime iso={repo?.indexedAt} fallback="-" />
                  </span>
                </div>
              </div>
            </div>
          </div>
          {status === 'done' && (
            <Link
              href={`/${locale}/repositories/${id}/wiki`}
              className="repository-detail-view-wiki inline-flex h-10 justify-self-start items-center justify-center gap-2 rounded-md bg-[var(--convergekit-ink)] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--convergekit-ink-2)] md:justify-self-end"
            >
              <BookOpen className="h-4 w-4" />
              {t('viewWiki')}
            </Link>
          )}
        </div>

        {(() => {
          const strip = formatHeaderIncrementalStrip(repo?.incrementalIndexing, new Date())
          if (!strip) return null
          const dot =
            strip.state === 'failed'
              ? 'bg-red-500'
              : strip.state === 'paused' || strip.state === 'needs_reindex'
                ? 'bg-[var(--convergekit-ink-4)]'
                : strip.state === 'active'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
          return (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[var(--convergekit-line-2)] bg-[var(--convergekit-bg-2)] px-3 py-2 text-[12px] text-[var(--convergekit-ink-3)]">
              <span className="inline-flex items-center gap-1.5 font-medium text-[var(--convergekit-ink-2)]">
                <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
                {strip.headline}
              </span>
              {strip.lastChecked && <span>Last checked {strip.lastChecked}</span>}
              {strip.nextCheck && <span>Next check in {strip.nextCheck}</span>}
              <span>Last check: {strip.lastCheck}</span>
            </div>
          )
        })()}

        {isAdmin && embeddingCompatibility && !embeddingCompatibility.compatible && (
          <div className="mt-6 flex items-start justify-between gap-4 rounded-[var(--convergekit-radius-lg)] border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-900">Embedding profile mismatch</p>
                <p className="mt-1 text-sm text-amber-800">{embeddingCompatibility.message}</p>
                {embeddingProfile && (
                  <p className="mt-1 text-xs text-amber-700">
                    Indexed profile: {embeddingProfile.model} ({embeddingProfile.dimensions} dims)
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleReindex}
              disabled={isReindexing}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-amber-900 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-60"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isReindexing && 'animate-spin')} />
              Reindex with current settings
            </button>
          </div>
        )}

        {/* Tabs + Wiki link */}
        <div className="mt-6 border-b border-[var(--convergekit-line)]">
          <div className="flex items-end justify-between">
            <nav className="flex gap-1">
              {availableTabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab)
                    trackRepositoryDetailEvent({
                      name: 'repository_tab_change',
                      repositoryId: id,
                      tab,
                    })
                  }}
                  className={cn(
                    '-mb-px border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
                    effectiveActiveTab === tab
                      ? 'border-[var(--convergekit-ink)] text-[var(--convergekit-ink)]'
                      : 'border-transparent text-[var(--convergekit-ink-3)] hover:border-[var(--convergekit-line-strong)] hover:text-[var(--convergekit-ink)]',
                  )}
                >
                  {t(`tabs.${tab}`)}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>

      <div className="repository-detail-tab-frame">
        {effectiveActiveTab === 'docs' && (
          <DocsTab
            key={jobId ?? 'core'}
            repositoryId={id}
            status={status as RepositoryResponse['status']}
            jobId={jobId}
            queue={queue}
            indexingFailure={repo?.indexingFailure ?? null}
          />
        )}
        {effectiveActiveTab === 'guide' && (
          <RepoGuideTab
            repositoryId={id}
            status={status as RepositoryResponse['status']}
            jobId={jobId}
            queue={queue}
          />
        )}
        {effectiveActiveTab === 'chat' && (
          <ChatTab
            repositoryId={id}
            compatibility={isAdmin ? embeddingCompatibility : null}
            embeddingProfile={embeddingProfile}
          />
        )}
        {effectiveActiveTab === 'settings' && (
          <SettingsTab repositoryId={id} repositoryName={name} isAdmin={isAdmin} />
        )}
      </div>
    </div>
  )
}
