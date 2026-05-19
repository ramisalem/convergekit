'use client'

import { GitHubSignInButton } from '@/components/github-sign-in-button'
import { WorkforceSsoSignInButton } from '@/components/workforce-sso-sign-in-button'
import { authConfigApi } from '@/lib/api-client'
import { getApiBaseUrl } from '@/lib/runtime-urls'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

const API_URL = getApiBaseUrl()

export default function SignInPage() {
  const t = useTranslations('auth')
  const [tab, setTab] = useState<'user' | 'admin'>('user')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // null = config not yet loaded; render a neutral skeleton instead of guessing the disabled state.
  const [workforceSsoEnabled, setWorkforceSsoEnabled] = useState<boolean | null>(null)
  const [workforceSsoProviderLabel, setWorkforceSsoProviderLabel] = useState('Workforce SSO')

  useEffect(() => {
    authConfigApi
      .getConfig()
      .then((config) => {
        setWorkforceSsoEnabled(config.workforceSsoEnabled)
        setWorkforceSsoProviderLabel(config.workforceSsoProviderLabel)
      })
      .catch(() => setWorkforceSsoEnabled(false))
  }, [])

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body?.message ?? body?.error ?? 'Invalid email or password')
        return
      }

      window.location.href = '/'
    } catch {
      setError('Failed to sign in. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-52px)] place-items-center px-6 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-[22px] flex items-center justify-center">
          <a href="/" aria-label="ConvergeKit home">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-[var(--convergekit-ink)] text-[13px] font-bold text-white">
              CK
            </span>
          </a>
        </div>

        <div className="rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white p-[26px]">
          <h1 className="m-0 text-center text-[22px] font-semibold leading-tight text-[var(--convergekit-ink)]">
            {t('signIn')}
          </h1>
          <p className="mb-5 mt-1 text-center text-[13px] text-[var(--convergekit-ink-3)]">
            {t('signInDescription')}
          </p>

          <div className="mb-[18px] grid grid-cols-2 gap-0.5 rounded-[var(--convergekit-radius-md)] bg-[var(--convergekit-bg-3)] p-[3px]">
            {(['user', 'admin'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`h-7 rounded-md text-[12.5px] font-medium capitalize transition-colors ${
                  tab === key
                    ? 'border border-[var(--convergekit-line)] bg-white text-[var(--convergekit-ink)] shadow-sm'
                    : 'border border-transparent text-[var(--convergekit-ink-3)] hover:text-[var(--convergekit-ink)]'
                }`}
              >
                {key}
              </button>
            ))}
          </div>

          {tab === 'admin' ? (
            <GitHubSignInButton label={t('signInWithGitHub')} />
          ) : (
            <div className="space-y-4">
              {workforceSsoEnabled === null ? (
                <div
                  aria-hidden="true"
                  className="h-10 w-full animate-pulse rounded-md border border-[var(--convergekit-line)] bg-[var(--convergekit-bg-3)]"
                />
              ) : (
                <>
                  <WorkforceSsoSignInButton
                    label={t('signInWithWorkforceSso', { provider: workforceSsoProviderLabel })}
                    disabled={!workforceSsoEnabled}
                  />
                  {!workforceSsoEnabled && (
                    <p className="text-center text-xs text-[var(--convergekit-ink-3)]">
                      {t('workforceSsoNotConfigured')}
                    </p>
                  )}
                </>
              )}
              {/*
                Email/password sign-in is a break-glass fallback only when workforce SSO is
                explicitly disabled. When SSO is enabled (or while we are still loading the config)
                we do not render the form so users have a single, unambiguous sign-in path.
              */}
              {workforceSsoEnabled === false && (
                <>
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-[var(--convergekit-line)]" />
                    <span className="text-xs text-[var(--convergekit-ink-4)]">
                      {t('invitedAccountSeparator')}
                    </span>
                    <div className="h-px flex-1 bg-[var(--convergekit-line)]" />
                  </div>
                  <form onSubmit={handleEmailSignIn} className="space-y-3">
                    <div>
                      <label
                        htmlFor="email"
                        className="mb-1 block text-xs font-medium text-[var(--convergekit-ink-2)]"
                      >
                        Email
                      </label>
                      <input
                        id="email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-9 w-full rounded-md border border-[var(--convergekit-line)] bg-white px-3 text-sm text-[var(--convergekit-ink)] outline-none focus:border-[var(--convergekit-focus)] focus:ring-2 focus:ring-[var(--convergekit-focus)]/15"
                        placeholder="you@example.com"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="password"
                        className="mb-1 block text-xs font-medium text-[var(--convergekit-ink-2)]"
                      >
                        Password
                      </label>
                      <input
                        id="password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-9 w-full rounded-md border border-[var(--convergekit-line)] bg-white px-3 text-sm text-[var(--convergekit-ink)] outline-none focus:border-[var(--convergekit-focus)] focus:ring-2 focus:ring-[var(--convergekit-focus)]/15"
                        placeholder="Enter your password"
                      />
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <button
                      type="submit"
                      disabled={loading}
                      className="h-9 w-full rounded-md bg-[var(--convergekit-ink)] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {loading ? 'Signing in...' : 'Sign in'}
                    </button>
                  </form>
                </>
              )}
            </div>
          )}
        </div>

        <p className="mx-6 mt-4 text-center text-[11.5px] leading-[1.5] text-[var(--convergekit-ink-4)]">
          {t('privacyNote')}
        </p>
      </div>
    </div>
  )
}
