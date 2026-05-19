'use client'

import { AddRepositoryDialog } from '@/components/add-repository-dialog'
import { ClientTime } from '@/components/ui/client-time'
import { PageHeader } from '@/components/ui/page-header'
import { StatusChip } from '@/components/ui/status-chip'
import { useUser } from '@/components/user-nav'
import { ApiError, repositoriesApi } from '@/lib/api-client'
import type { RepositoryResponse } from '@convergekit/types'
import { ChevronRight, GitBranch, Plus, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

function ProviderBadge({ provider }: { provider: RepositoryResponse['provider'] }) {
  return (
    <span className="inline-flex h-[22px] items-center rounded-md border border-[var(--convergekit-line)] px-2 text-[11.5px] font-medium text-[var(--convergekit-ink-3)]">
      {provider}
    </span>
  )
}

function RepositoryRow({ repo }: { repo: RepositoryResponse }) {
  const t = useTranslations('repositories')

  return (
    <a
      href={`/repositories/${repo.id}`}
      className="flex items-center justify-between rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white px-5 py-4 transition-colors hover:bg-[var(--convergekit-bg-2)]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-[var(--convergekit-line)] bg-[var(--convergekit-bg-3)]">
          <GitBranch className="h-4 w-4 text-[var(--convergekit-ink-3)]" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--convergekit-ink)]">
            {repo.name}
          </p>
          <p className="truncate font-mono text-xs text-[var(--convergekit-ink-3)]">
            {repo.cloneUrl}
          </p>
        </div>
      </div>
      <div className="ml-6 flex flex-shrink-0 items-center gap-4">
        <ProviderBadge provider={repo.provider} />
        <StatusChip status={repo.status} />
        <span className="hidden text-xs text-[var(--convergekit-ink-3)] sm:block">
          {t('lastIndexed')}: <ClientTime iso={repo.updatedAt} fallback="-" />
        </span>
        <ChevronRight className="h-4 w-4 text-[var(--convergekit-ink-4)]" />
      </div>
    </a>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const t = useTranslations('repositories')
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--convergekit-radius-lg)] border border-dashed border-[var(--convergekit-line-strong)] bg-white py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[var(--convergekit-bg-3)]">
        <GitBranch className="h-6 w-6 text-[var(--convergekit-ink-3)]" />
      </div>
      <p className="mt-4 text-sm font-semibold text-[var(--convergekit-ink)]">{t('empty')}</p>
      <p className="mt-1 text-sm text-[var(--convergekit-ink-3)]">{t('emptyDescription')}</p>
      <button
        onClick={onAdd}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-[var(--convergekit-ink)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        <Plus className="h-4 w-4" />
        {t('addRepository')}
      </button>
    </div>
  )
}

function NoRepositoriesAssignedState({
  supportContacts,
  title,
  description,
  contactsLabel,
}: {
  supportContacts: { name: string; email: string }[]
  title: string
  description: string
  contactsLabel: string
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--convergekit-radius-lg)] border border-dashed border-[var(--convergekit-line-strong)] bg-white px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[var(--convergekit-bg-3)]">
        <GitBranch className="h-6 w-6 text-[var(--convergekit-ink-3)]" />
      </div>
      <p className="mt-4 text-sm font-semibold text-[var(--convergekit-ink)]">{title}</p>
      <p className="mt-1 max-w-md text-sm text-[var(--convergekit-ink-3)]">{description}</p>
      {supportContacts.length > 0 && (
        <div className="mt-5 space-y-1 text-sm">
          <p className="text-[var(--convergekit-ink-3)]">{contactsLabel}</p>
          {supportContacts.map((contact) => (
            <a
              key={contact.email}
              href={`mailto:${contact.email}`}
              className="block font-medium text-[var(--convergekit-ink)] underline underline-offset-2"
            >
              {contact.name} ({contact.email})
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export default function RepositoriesPage() {
  const t = useTranslations('repositories')
  const { user } = useUser()
  const router = useRouter()
  const isAdmin = user?.role === 'admin'
  const [dialogOpen, setDialogOpen] = useState(false)
  const [repositories, setRepositories] = useState<RepositoryResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | RepositoryResponse['status']>('all')
  const [providerFilter, setProviderFilter] = useState<'all' | RepositoryResponse['provider']>(
    'all',
  )

  useEffect(() => {
    let cancelled = false
    repositoriesApi
      .list()
      .then(({ repositories }) => {
        if (!cancelled) setRepositories(repositories)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          setError('Redirecting to sign in…')
          router.replace('/auth/sign-in')
          return
        }
        setError('Failed to load repositories')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [router])

  const filteredRepositories = repositories.filter((repo) => {
    const normalizedQuery = query.trim().toLowerCase()
    const matchesQuery =
      !normalizedQuery ||
      [repo.name, repo.cloneUrl, repo.provider].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      )
    const matchesStatus = statusFilter === 'all' || repo.status === statusFilter
    const matchesProvider = providerFilter === 'all' || repo.provider === providerFilter

    return matchesQuery && matchesStatus && matchesProvider
  })

  const addButton = (
    <button
      onClick={() => setDialogOpen(true)}
      className="inline-flex items-center gap-2 rounded-md bg-[var(--convergekit-ink)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
    >
      <Plus className="h-4 w-4" />
      {t('addRepository')}
    </button>
  )

  return (
    <>
      <div className="mx-auto max-w-[88rem] px-5 py-8">
        <PageHeader
          eyebrow="Workspace"
          title={t('title')}
          description={`${repositories.length} repositories`}
          actions={isAdmin && repositories.length > 0 ? addButton : null}
        />

        {loading ? (
          <div className="mt-6 flex items-center justify-center rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-600" />
          </div>
        ) : error ? (
          <div className="mt-6 rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white px-6 py-12 text-center">
            <p className="text-sm text-[var(--convergekit-ink-3)]">{error}</p>
          </div>
        ) : repositories.length === 0 ? (
          <div className="mt-6">
            {isAdmin ? (
            <EmptyState onAdd={() => setDialogOpen(true)} />
          ) : (
            <NoRepositoriesAssignedState
              supportContacts={user?.supportContacts ?? []}
              title={t('emptyAssignedTitle')}
              description={t('emptyAssignedDescription')}
              contactsLabel={t('emptyAssignedContactsLabel')}
            />
            )}
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <div className="flex flex-col gap-3 rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white p-3 md:flex-row md:items-center">
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--convergekit-ink-4)]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search repositories"
                  className="h-9 w-full rounded-md border border-[var(--convergekit-line)] bg-white pl-9 pr-3 text-sm text-[var(--convergekit-ink)] outline-none focus:border-[var(--convergekit-focus)] focus:ring-2 focus:ring-[var(--convergekit-focus)]/15"
                />
              </label>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as 'all' | RepositoryResponse['status'])
                }
                className="h-9 rounded-md border border-[var(--convergekit-line)] bg-white px-3 text-sm text-[var(--convergekit-ink-2)] outline-none focus:border-[var(--convergekit-focus)]"
              >
                <option value="all">All statuses</option>
                <option value="pending">{t('status.pending')}</option>
                <option value="processing">{t('status.processing')}</option>
                <option value="done">{t('status.done')}</option>
                <option value="failed">{t('status.failed')}</option>
              </select>
              <select
                value={providerFilter}
                onChange={(event) =>
                  setProviderFilter(event.target.value as 'all' | RepositoryResponse['provider'])
                }
                className="h-9 rounded-md border border-[var(--convergekit-line)] bg-white px-3 text-sm text-[var(--convergekit-ink-2)] outline-none focus:border-[var(--convergekit-focus)]"
              >
                <option value="all">All providers</option>
                <option value="github">GitHub</option>
              </select>
            </div>
            {filteredRepositories.map((repo) => (
              <RepositoryRow key={repo.id} repo={repo} />
            ))}
            {filteredRepositories.length === 0 && (
              <div className="rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white px-6 py-12 text-center text-sm text-[var(--convergekit-ink-3)]">
                No repositories match the current filters.
              </div>
            )}
          </div>
        )}
      </div>

      <AddRepositoryDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  )
}
