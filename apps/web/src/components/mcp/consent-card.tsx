'use client'

import { ApiError, mcpOAuthApi, type McpConsentDisplay } from '@/lib/api-client'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

export function ConsentCard({ request }: { request: string }) {
  const t = useTranslations('mcpConsent')
  const [display, setDisplay] = useState<McpConsentDisplay | null>(null)
  const [needsSignIn, setNeedsSignIn] = useState(false)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [approvedRedirect, setApprovedRedirect] = useState<string | null>(null)

  useEffect(() => {
    if (!request) {
      setError(true)
      return
    }
    mcpOAuthApi
      .getConsent(request)
      .then(setDisplay)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) setNeedsSignIn(true)
        else setError(true)
      })
  }, [request])

  // After approval, briefly show a success state, then forward to the client's
  // redirect_uri to deliver the authorization code (use replace so the back button
  // can't re-submit the consumed consent request).
  useEffect(() => {
    if (!approvedRedirect) return
    const timer = setTimeout(() => window.location.replace(approvedRedirect), 1200)
    return () => clearTimeout(timer)
  }, [approvedRedirect])

  async function decide(decision: 'approve' | 'deny') {
    setBusy(true)
    try {
      const { redirectUri } = await mcpOAuthApi.decideConsent(request, decision)
      if (decision === 'approve') {
        setApprovedRedirect(redirectUri)
      } else {
        window.location.href = redirectUri
      }
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  if (needsSignIn) {
    const back = typeof window !== 'undefined' ? window.location.href : ''
    return (
      <Card>
        <p className="text-sm text-[var(--convergekit-ink-2)]">{t('signInPrompt')}</p>
        <a
          href={`/auth/sign-in?redirectTo=${encodeURIComponent(back)}`}
          className="mt-3 inline-flex h-9 items-center rounded-md bg-[var(--convergekit-ink)] px-4 text-sm font-medium text-white"
        >
          {t('signInPrompt')}
        </a>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <p className="text-sm text-red-600">{t('error')}</p>
      </Card>
    )
  }

  if (approvedRedirect) {
    // `||` (not `??`) so an empty-string clientName also falls back, avoiding
    // broken copy like " now has read-only access…".
    const client = display?.clientName || 'your agent'
    return (
      <Card>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-700"
          >
            ✓
          </span>
          <h1 className="m-0 text-lg font-semibold text-[var(--convergekit-ink)]">
            {t('successTitle')}
          </h1>
        </div>
        <p className="mt-3 text-sm text-[var(--convergekit-ink-2)]">{t('successBody', { client })}</p>
        <p className="mt-3 text-[13px] text-[var(--convergekit-ink-3)]">
          {t('successClose', { client })}
        </p>
        <a
          href={approvedRedirect}
          className="mt-4 inline-block text-sm font-medium text-[var(--convergekit-ink)] underline"
        >
          {t('successManual', { client })}
        </a>
      </Card>
    )
  }

  if (!display) {
    return (
      <Card>
        <div
          aria-hidden
          className="h-24 w-full animate-pulse rounded-md bg-[var(--convergekit-bg-3)]"
        />
      </Card>
    )
  }

  return (
    <Card>
      <h1 className="m-0 text-lg font-semibold text-[var(--convergekit-ink)]">
        {t('title', { client: display.clientName })}
      </h1>
      <p className="mt-1 text-[13px] text-[var(--convergekit-ink-3)]">
        {t('subtitle', { email: display.user.email })}
      </p>
      <p className="mt-4 text-sm text-[var(--convergekit-ink-2)]">
        {t('grant', { count: display.repositoryCount })}
      </p>
      <p className="mt-3 text-xs font-medium uppercase text-[var(--convergekit-ink-4)]">
        {t('scopes')}
      </p>
      <ul className="mt-1 list-disc pl-5 text-sm text-[var(--convergekit-ink-2)]">
        {display.scopes.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => decide('approve')}
          className="h-9 flex-1 rounded-md bg-[var(--convergekit-ink)] px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {t('approve')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide('deny')}
          className="h-9 flex-1 rounded-md border border-[var(--convergekit-line)] px-4 text-sm font-medium text-[var(--convergekit-ink)] disabled:opacity-50"
        >
          {t('deny')}
        </button>
      </div>
    </Card>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[420px] rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white p-[26px]">
      {children}
    </div>
  )
}
