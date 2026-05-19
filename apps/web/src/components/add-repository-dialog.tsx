'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { X, Search, ChevronDown, Lock, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { repositoriesApi, githubApi, ApiError } from '@/lib/api-client'
import type { GitHubRepo } from '@/lib/api-client'
import type { CreateRepositoryInput } from '@convergekit/types'

interface Props {
  open: boolean
  onClose: () => void
}

export function AddRepositoryDialog({ open, onClose }: Props) {
  const t = useTranslations('repositories.form')
  const router = useRouter()

  // GitHub repo picker state
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [search, setSearch] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selected, setSelected] = useState<GitHubRepo | null>(null)
  const [githubWarning, setGithubWarning] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Branch override (user can change from default)
  const [branch, setBranch] = useState('main')

  // Submit state
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch GitHub repos when dialog opens
  useEffect(() => {
    if (!open) return
    setLoadingRepos(true)
    githubApi.listRepos()
      .then(({ repos, warning }) => {
        setRepos(repos)
        setGithubWarning(warning ?? null)
      })
      .catch(() => {
        setRepos([])
        setGithubWarning(null)
      })
      .finally(() => setLoadingRepos(false))
  }, [open])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSelected(null)
      setSearch('')
      setDropdownOpen(false)
      setBranch('main')
      setError(null)
      setGithubWarning(null)
    }
  }, [open])

  // Update branch when a repo is selected
  useEffect(() => {
    if (selected) setBranch(selected.defaultBranch)
  }, [selected])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const normalizedSearch = search.trim().toLowerCase()
  const filtered = repos.filter((repo) => {
    if (!normalizedSearch) return true

    return [
      repo.fullName,
      repo.name,
      repo.description ?? '',
    ].some((value) => value.toLowerCase().includes(normalizedSearch))
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setError(null)
    setSubmitting(true)
    try {
      const input: CreateRepositoryInput = {
        name: selected.name,
        cloneUrl: selected.cloneUrl,
        provider: 'github',
        defaultBranch: branch,
        isPrivate: selected.isPrivate,
      }
      const { repositoryId, jobId } = await repositoriesApi.create(input)
      onClose()
      router.push(`/repositories/${repositoryId}?jobId=${jobId}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-[560px] rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--convergekit-line-2)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--convergekit-ink)]">{t('title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--convergekit-line)] p-1.5 text-[var(--convergekit-ink-4)] transition-colors hover:border-[var(--convergekit-line-strong)] hover:text-[var(--convergekit-ink-2)]"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {githubWarning && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {githubWarning}
            </p>
          )}

          {/* GitHub repo picker */}
          <div className="space-y-1.5" ref={dropdownRef}>
            <label className="text-sm font-medium text-[var(--convergekit-ink-2)]">
              Repository
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                className={cn(
                  'flex h-10 w-full items-center justify-between rounded-md border border-[var(--convergekit-line)] bg-white px-3 text-sm text-[var(--convergekit-ink)] outline-none transition-colors hover:border-[var(--convergekit-line-strong)] focus:border-[var(--convergekit-focus)] focus:ring-2 focus:ring-[var(--convergekit-focus)]/15',
                  !selected && 'text-[var(--convergekit-ink-4)]',
                )}
              >
                {selected ? (
                  <span className="flex min-w-0 items-center gap-2">
                    {selected.isPrivate ? (
                      <Lock className="h-3.5 w-3.5 flex-shrink-0 text-[var(--convergekit-ink-4)]" />
                    ) : (
                      <Globe className="h-3.5 w-3.5 flex-shrink-0 text-[var(--convergekit-ink-4)]" />
                    )}
                    <span className="truncate">{selected.fullName}</span>
                  </span>
                ) : (
                  loadingRepos ? 'Loading repositories…' : 'Select a repository'
                )}
                <ChevronDown className="ml-2 h-4 w-4 flex-shrink-0 text-[var(--convergekit-ink-4)]" />
              </button>

              {dropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-[var(--convergekit-radius-md)] border border-[var(--convergekit-line)] bg-white shadow-lg">
                  {/* Search */}
                  <div className="flex items-center gap-2 border-b border-[var(--convergekit-line-2)] px-3 py-2">
                    <Search className="h-3.5 w-3.5 flex-shrink-0 text-[var(--convergekit-ink-4)]" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Filter repositories by name, owner, or description…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="flex-1 text-sm text-[var(--convergekit-ink)] outline-none placeholder:text-[var(--convergekit-ink-4)]"
                    />
                  </div>

                  {/* List */}
                  <ul className="max-h-60 overflow-y-auto py-1">
                    {filtered.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-[var(--convergekit-ink-3)]">
                        {loadingRepos ? 'Loading…' : 'No repositories found'}
                      </li>
                    ) : (
                      filtered.map((repo) => (
                        <li key={repo.fullName}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelected(repo)
                              setDropdownOpen(false)
                              setSearch('')
                            }}
                            className={cn(
                              'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--convergekit-bg-2)]',
                              selected?.fullName === repo.fullName && 'bg-[var(--convergekit-bg-2)]',
                            )}
                          >
                            {repo.isPrivate ? (
                              <Lock className="h-3.5 w-3.5 flex-shrink-0 text-[var(--convergekit-ink-4)]" />
                            ) : (
                              <Globe className="h-3.5 w-3.5 flex-shrink-0 text-[var(--convergekit-ink-4)]" />
                            )}
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-[var(--convergekit-ink)]">
                                {repo.fullName}
                              </span>
                              {repo.description && (
                                <span className="block truncate text-xs text-[var(--convergekit-ink-3)]">
                                  {repo.description}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Branch (shown after selection) */}
          {selected && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--convergekit-ink-2)]">
                {t('defaultBranch')}
              </label>
              <input
                type="text"
                required
                placeholder={t('defaultBranchPlaceholder')}
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="h-10 w-full rounded-md border border-[var(--convergekit-line)] px-3 text-sm text-[var(--convergekit-ink)] outline-none transition-colors hover:border-[var(--convergekit-line-strong)] focus:border-[var(--convergekit-focus)] focus:ring-2 focus:ring-[var(--convergekit-focus)]/15"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[var(--convergekit-line)] px-4 py-2 text-sm font-medium text-[var(--convergekit-ink-2)] transition-colors hover:bg-[var(--convergekit-bg-3)]"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || !selected}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                submitting || !selected
                  ? 'cursor-not-allowed border border-[var(--convergekit-line)] bg-[var(--convergekit-bg-3)] text-[var(--convergekit-ink-4)]'
                  : 'border border-[var(--convergekit-ink)] bg-[var(--convergekit-ink)] text-white hover:opacity-90',
              )}
            >
              {submitting ? t('submitting') : t('submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
