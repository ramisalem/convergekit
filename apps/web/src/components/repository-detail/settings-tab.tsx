'use client'

import { ApiError, repositoriesApi, type IndexingRunResponse } from '@/lib/api-client'
import { RefreshCw, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

interface Props {
  repositoryId: string
  repositoryName: string
  isAdmin: boolean
}

export function SettingsTab({ repositoryId, repositoryName, isAdmin }: Props) {
  const t = useTranslations('repositoryDetail.settings')
  const router = useRouter()
  const params = useParams<{ locale: string }>()

  // Reindex state
  const [reindexing, setReindexing] = useState(false)
  const [reindexError, setReindexError] = useState<string | null>(null)

  // Regenerate wiki state
  const [regeneratingWiki, setRegeneratingWiki] = useState(false)
  const [regenerateWikiError, setRegenerateWikiError] = useState<string | null>(null)

  // Incremental indexing state
  const [incrementalRuns, setIncrementalRuns] = useState<IndexingRunResponse[]>([])
  const [incrementalBusy, setIncrementalBusy] = useState<null | 'check' | 'pause' | 'resume'>(null)
  const [incrementalError, setIncrementalError] = useState<string | null>(null)
  const [incrementalPaused, setIncrementalPaused] = useState(false)

  // Delete repository state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function reindex() {
    setReindexing(true)
    setReindexError(null)
    try {
      const { jobId } = await repositoriesApi.reindex(repositoryId)
      // Client-side navigation preserves the cache; the detail page force-refetches
      // on the new jobId and remounts DocsTab, so the indexing UI still resets.
      router.push(`/${params.locale}/repositories/${repositoryId}?tab=docs&jobId=${jobId}`)
    } catch (err) {
      setReindexError(err instanceof ApiError ? err.message : 'Failed to start reindex')
      setReindexing(false)
    }
  }

  async function regenerateWiki() {
    setRegeneratingWiki(true)
    setRegenerateWikiError(null)
    try {
      const { jobId, queue } = await repositoriesApi.regenerateWiki(repositoryId)
      const queueName = queue ?? 'wiki-generation'
      router.push(`/${params.locale}/repositories/${repositoryId}?tab=docs&jobId=${jobId}&queue=${encodeURIComponent(queueName)}`)
    } catch (err) {
      setRegenerateWikiError(
        err instanceof ApiError ? err.message : 'Failed to start wiki regeneration',
      )
      setRegeneratingWiki(false)
    }
  }

  const loadIncrementalRuns = useCallback(async () => {
    if (!isAdmin) return
    try {
      const { runs } = await repositoriesApi.listIncrementalRuns(repositoryId)
      setIncrementalRuns(runs)
    } catch {
      // non-fatal
    }
  }, [isAdmin, repositoryId])

  useEffect(() => {
    void loadIncrementalRuns()
  }, [loadIncrementalRuns])

  async function runIncrementalAction(action: 'check' | 'pause' | 'resume') {
    setIncrementalBusy(action)
    setIncrementalError(null)
    try {
      if (action === 'check') {
        const { outcome } = await repositoriesApi.checkIncrementalNow(repositoryId)
        if (outcome === 'skipped_no_baseline') {
          setIncrementalError(
            'This repository was indexed before commit tracking. Re-index once to enable incremental checks.',
          )
        }
      }
      if (action === 'pause') {
        await repositoriesApi.pauseIncremental(repositoryId)
        setIncrementalPaused(true)
      }
      if (action === 'resume') {
        await repositoriesApi.resumeIncremental(repositoryId)
        setIncrementalPaused(false)
      }
      await loadIncrementalRuns()
    } catch (err) {
      setIncrementalError(err instanceof ApiError ? err.message : 'Incremental action failed')
    } finally {
      setIncrementalBusy(null)
    }
  }

  async function deleteRepository() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await repositoriesApi.delete(repositoryId)
      router.push(`/${params.locale}/repositories`)
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete repository')
      setDeleting(false)
    }
  }

  return (
    <div className="settings-tab-shell flex w-full flex-col gap-3.5 pb-10 pt-5">
      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <h3 className="text-sm font-semibold">CI / automation tokens</h3>
        <p className="mt-1 text-sm text-neutral-500">
          Create and manage your own CI / automation tokens under{' '}
          <Link className="underline" href={`/${params.locale}/account/ci-tokens`}>
            your account
          </Link>{' '}
          (if an admin has enabled the capability for you). To connect an AI agent, use{' '}
          <Link className="underline" href={`/${params.locale}/account/agents`}>
            Connect your agent
          </Link>
          .
        </p>
      </section>

      {isAdmin && (
        <>
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {/* Re-index section */}
            <section className="rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white shadow-sm">
              <div className="border-b border-[var(--convergekit-line-2)] px-5 py-4">
                <h3 className="text-sm font-semibold text-[var(--convergekit-ink)]">
                  Re-index repository
                </h3>
                <p className="mt-0.5 text-[12.5px] text-[var(--convergekit-ink-3)]">
                  Re-clone, parse, and embed everything from scratch.
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <p className="text-xs text-[var(--convergekit-ink-4)]">
                  Last full index: use repository status above
                </p>
                {reindexError && <p className="text-xs text-destructive">{reindexError}</p>}
                <button
                  type="button"
                  onClick={reindex}
                  disabled={reindexing}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[var(--convergekit-line)] bg-white px-3 text-sm font-medium text-[var(--convergekit-ink-2)] transition-colors hover:bg-[var(--convergekit-bg-3)] disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${reindexing ? 'animate-spin' : ''}`} />
                  {reindexing ? t('reindexing') : 'Re-index'}
                </button>
              </div>
            </section>

            {/* Regenerate Wiki section */}
            <section className="rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white shadow-sm">
              <div className="border-b border-[var(--convergekit-line-2)] px-5 py-4">
                <h3 className="text-sm font-semibold text-[var(--convergekit-ink)]">
                  Regenerate Wiki
                </h3>
                <p className="mt-0.5 text-[12.5px] text-[var(--convergekit-ink-3)]">
                  Skip indexing; rebuild pages from current chunks.
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <p className="text-xs text-[var(--convergekit-ink-4)]">
                  Rebuilds wiki pages from current evidence
                </p>
                {regenerateWikiError && (
                  <p className="text-xs text-destructive">{regenerateWikiError}</p>
                )}
                <button
                  type="button"
                  onClick={regenerateWiki}
                  disabled={regeneratingWiki}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[var(--convergekit-line)] bg-white px-3 text-sm font-medium text-[var(--convergekit-ink-2)] transition-colors hover:bg-[var(--convergekit-bg-3)] disabled:opacity-50"
                >
                  <Sparkles className={`h-3.5 w-3.5 ${regeneratingWiki ? 'animate-pulse' : ''}`} />
                  {regeneratingWiki ? t('regeneratingWiki') : 'Regenerate'}
                </button>
              </div>
            </section>
          </div>

          <section className="rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--convergekit-line-2)] px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--convergekit-ink)]">
                  Incremental indexing
                </h3>
                <p className="mt-0.5 text-[12.5px] text-[var(--convergekit-ink-3)]">
                  Lightweight, non-destructive freshness checks. Re-index and Regenerate Wiki are separate.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void runIncrementalAction('check')}
                  disabled={incrementalBusy !== null}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--convergekit-line)] bg-white px-3 text-sm font-medium text-[var(--convergekit-ink-2)] transition-colors hover:bg-[var(--convergekit-bg-3)] disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${incrementalBusy === 'check' ? 'animate-spin' : ''}`} />
                  Check now
                </button>
                {incrementalPaused ? (
                  <button
                    type="button"
                    onClick={() => void runIncrementalAction('resume')}
                    disabled={incrementalBusy !== null}
                    className="inline-flex h-9 items-center rounded-md border border-[var(--convergekit-line)] bg-white px-3 text-sm font-medium text-[var(--convergekit-ink-2)] transition-colors hover:bg-[var(--convergekit-bg-3)] disabled:opacity-50"
                  >
                    Resume automatic checks
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void runIncrementalAction('pause')}
                    disabled={incrementalBusy !== null}
                    className="inline-flex h-9 items-center rounded-md border border-[var(--convergekit-line)] bg-white px-3 text-sm font-medium text-[var(--convergekit-ink-2)] transition-colors hover:bg-[var(--convergekit-bg-3)] disabled:opacity-50"
                  >
                    Pause automatic checks
                  </button>
                )}
              </div>
            </div>
            {incrementalError && (
              <p className="px-5 pt-3 text-xs text-destructive">{incrementalError}</p>
            )}
            <div className="px-5 py-4">
              {incrementalRuns.length === 0 ? (
                <p className="text-xs text-[var(--convergekit-ink-3)]">No incremental runs yet.</p>
              ) : (
                <ul className="space-y-2">
                  {incrementalRuns.map((run) => (
                    <li
                      key={run.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--convergekit-ink-3)]"
                    >
                      <span className="font-medium text-[var(--convergekit-ink-2)]">{run.trigger}</span>
                      <span>{run.status}</span>
                      {run.fromCommit && run.toCommit && (
                        <span className="font-mono">
                          {run.fromCommit.slice(0, 7)}→{run.toCommit.slice(0, 7)}
                        </span>
                      )}
                      <span>
                        {run.changedFileCount} changed · {run.deletedFileCount} deleted ·{' '}
                        {run.skippedFileCount} skipped · {run.chunkCount} chunks
                      </span>
                      {run.durationMs != null && <span>{Math.round(run.durationMs / 1000)}s</span>}
                      {run.failureReason && (
                        <span className="text-[var(--convergekit-align-conflict-fg)]">
                          {run.failureReason}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Danger Zone section */}
          <section className="rounded-[var(--convergekit-radius-lg)] border border-[#fecaca] bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-[#b91c1c]">Danger zone</h3>
                <p className="mt-0.5 text-[12.5px] text-[var(--convergekit-ink-3)]">
                  Deleting a repository removes all indexed data, wiki pages, chats, and tokens.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteDialog(true)}
                className="inline-flex h-9 items-center rounded-md bg-[#dc2626] px-3 text-sm font-medium text-white transition-colors hover:bg-[#b91c1c]"
              >
                Delete repository
              </button>
            </div>
          </section>
        </>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !deleting && setShowDeleteDialog(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl bg-white shadow-xl mx-4">
            <div className="px-6 py-5 border-b border-neutral-100">
              <h2 className="text-base font-semibold text-neutral-900">
                {t('deleteRepositoryConfirmTitle', { name: repositoryName })}
              </h2>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-neutral-600">{t('deleteRepositoryConfirmBody')}</p>
              {deleteError && <p className="mt-3 text-sm text-red-600">{deleteError}</p>}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-100">
              <button
                onClick={() => setShowDeleteDialog(false)}
                disabled={deleting}
                className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
              >
                {t('cancel')}
              </button>
              <button
                onClick={deleteRepository}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? t('deleting') : t('deleteRepository')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
