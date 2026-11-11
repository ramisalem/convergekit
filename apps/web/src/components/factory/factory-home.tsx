'use client'

import { PageHeader } from '@/components/ui/page-header'
import { useUser } from '@/components/user-nav'
import { ApiError, factoryApi, type FactoryHubRepo, type FactoryMe } from '@/lib/api-client'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

type MeState =
  | { kind: 'loading' }
  | { kind: 'disabled' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; me: FactoryMe }

type HubState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; repos: FactoryHubRepo[] }

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function FactoryHome() {
  const t = useTranslations('factory')
  const { user, loading: userLoading } = useUser()
  const [me, setMe] = useState<MeState>({ kind: 'loading' })

  const loadMe = useCallback(() => {
    setMe({ kind: 'loading' })
    factoryApi
      .me()
      .then((value) => setMe({ kind: 'ready', me: value }))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) setMe({ kind: 'disabled' })
        else setMe({ kind: 'error', message: errorMessage(error) })
      })
  }, [])

  useEffect(() => {
    if (user) loadMe()
  }, [user, loadMe])

  if (userLoading || (user && me.kind === 'loading')) {
    return <p className="text-sm text-[var(--convergekit-ink-3)]">{t('loading')}</p>
  }

  if (!user) {
    return (
      <Notice title={t('signedOutTitle')} body={t('signedOutBody')}>
        <a
          href="/auth/sign-in"
          className="mt-4 inline-flex rounded-md bg-[var(--convergekit-ink)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          {t('signIn')}
        </a>
      </Notice>
    )
  }

  if (me.kind === 'disabled') {
    return <Notice title={t('disabledTitle')} body={t('disabledBody')} />
  }

  if (me.kind === 'error') {
    return (
      <Notice title={t('githubErrorTitle')} body={me.message}>
        <RetryButton label={t('retry')} onClick={loadMe} />
      </Notice>
    )
  }

  if (me.kind !== 'ready') return null
  const value = me.me

  if (!value.member) {
    if (value.reason === 'github_error') {
      return (
        <Notice title={t('githubErrorTitle')} body={t('githubErrorBody')}>
          <RetryButton label={t('retry')} onClick={loadMe} />
        </Notice>
      )
    }
    return (
      <Notice
        title={t('notMemberTitle')}
        body={
          value.reason === 'no_github_account'
            ? t('noGithubBody')
            : t('notMemberBody', {
                repo: value.accessRepo,
                login: value.login ? `@${value.login}` : t('notMemberNoLogin'),
              })
        }
      />
    )
  }

  return <MemberHome me={value} />
}

function MemberHome({ me }: { me: Extract<FactoryMe, { member: true }> }) {
  const t = useTranslations('factory')
  const [hub, setHub] = useState<HubState>({ kind: 'loading' })

  useEffect(() => {
    factoryApi
      .hub()
      .then((value) => setHub({ kind: 'ready', repos: value.repos }))
      .catch((error: unknown) => setHub({ kind: 'error', message: errorMessage(error) }))
  }, [])

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('title')}
        description={t('description')}
        meta={
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            <span>{t('signedInAs', { login: me.login })}</span>
            <a
              className="underline-offset-2 hover:underline"
              href={`https://github.com/${me.hubRepo}`}
              target="_blank"
              rel="noreferrer"
            >
              {t('hubLink', { repo: me.hubRepo })}
            </a>
            {me.board && (
              <a
                className="underline-offset-2 hover:underline"
                href={me.board}
                target="_blank"
                rel="noreferrer"
              >
                {t('board')}
              </a>
            )}
          </span>
        }
      />

      <section>
        <h2 className="text-sm font-semibold text-[var(--convergekit-ink)]">
          {t('featuresTitle')}
        </h2>
        <p className="mt-2 rounded-md border border-dashed border-[var(--convergekit-line)] p-6 text-center text-sm text-[var(--convergekit-ink-3)]">
          {t('featuresEmpty')}
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-[var(--convergekit-ink)]">{t('reposTitle')}</h2>
        {hub.kind === 'loading' && (
          <p className="mt-2 text-sm text-[var(--convergekit-ink-3)]">{t('loading')}</p>
        )}
        {hub.kind === 'error' && (
          <p className="mt-2 text-sm text-red-600">{t('hubError', { error: hub.message })}</p>
        )}
        {hub.kind === 'ready' && hub.repos.length === 0 && (
          <p className="mt-2 text-sm text-[var(--convergekit-ink-3)]">{t('reposEmpty')}</p>
        )}
        {hub.kind === 'ready' && hub.repos.length > 0 && (
          <ul className="mt-2 grid gap-3 sm:grid-cols-2">
            {hub.repos.map((repo) => (
              <RepoCard key={repo.fullName} repo={repo} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function RepoCard({ repo }: { repo: FactoryHubRepo }) {
  const t = useTranslations('factory')
  const profile = repo.profile
  const notRecorded = <span className="text-[var(--convergekit-ink-4)]">{t('notRecorded')}</span>

  return (
    <li className="min-w-0 rounded-md border border-[var(--convergekit-line)] bg-white p-4">
      <a
        href={`https://github.com/${repo.fullName}`}
        target="_blank"
        rel="noreferrer"
        className="block truncate text-sm font-medium text-[var(--convergekit-ink)] hover:underline"
      >
        {repo.fullName}
      </a>
      {profile?.app && (
        <p className="mt-0.5 line-clamp-2 text-xs text-[var(--convergekit-ink-3)]">{profile.app}</p>
      )}
      {!profile ? (
        <p className="mt-3 text-xs text-[var(--convergekit-ink-4)]">{t('noProfile')}</p>
      ) : (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-[var(--convergekit-ink-3)]">{t('product')}</dt>
          <dd className="min-w-0 truncate">{profile.product ?? notRecorded}</dd>
          <dt className="text-[var(--convergekit-ink-3)]">{t('integrationBranch')}</dt>
          <dd className="min-w-0 truncate font-mono">{profile.integrationBranch ?? notRecorded}</dd>
          <dt className="text-[var(--convergekit-ink-3)]">{t('staging')}</dt>
          <dd className="min-w-0 truncate">
            {profile.stagingSite ? (
              <a
                href={profile.stagingSite}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                {profile.stagingSite.replace(/^https?:\/\//, '')}
              </a>
            ) : (
              notRecorded
            )}
          </dd>
          <dt className="text-[var(--convergekit-ink-3)]">{t('productOwner')}</dt>
          <dd className="min-w-0 truncate">
            {profile.people.productOwners.length > 0
              ? profile.people.productOwners.map((login) => `@${login}`).join(', ')
              : notRecorded}
          </dd>
        </dl>
      )}
    </li>
  )
}

function Notice({
  title,
  body,
  children,
}: {
  title: string
  body: string
  children?: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-lg rounded-md border border-[var(--convergekit-line)] bg-white p-6">
      <h1 className="text-lg font-semibold text-[var(--convergekit-ink)]">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-[var(--convergekit-ink-3)]">{body}</p>
      {children}
    </div>
  )
}

function RetryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 h-8 rounded-md border border-[var(--convergekit-line)] px-3 text-sm font-medium text-[var(--convergekit-ink)]"
    >
      {label}
    </button>
  )
}
