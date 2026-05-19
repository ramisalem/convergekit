'use client'

import { useEffect, useState } from 'react'
import { invitesApi } from '@/lib/api-client'

type VerifyState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'ready'; email: string; hasPassword: boolean }

export default function AcceptInvitePage() {
  const [state, setState] = useState<VerifyState>({ status: 'loading' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const token =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('token') ?? ''
      : ''

  useEffect(() => {
    if (!token) {
      setState({ status: 'invalid' })
      return
    }
    invitesApi
      .verify(token)
      .then((res) =>
        setState({ status: 'ready', email: res.email, hasPassword: res.hasPassword }),
      )
      .catch(() => setState({ status: 'invalid' }))
  }, [token])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    if (password.length < 8) {
      setSubmitError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setSubmitError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      await invitesApi.setPassword({ token, password })
      setDone(true)
    } catch {
      setSubmitError('This link is invalid or has expired. Contact your admin for a new one.')
    } finally {
      setSubmitting(false)
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
        <div className="text-sm text-neutral-500">Verifying link…</div>
      </div>
    )
  }

  if (state.status === 'invalid') {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold tracking-tight">Link invalid</h1>
          <p className="mt-2 text-sm text-neutral-500">
            This link is invalid or has expired. Contact your admin for a new one.
          </p>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold tracking-tight">Password set</h1>
          <p className="mt-2 text-sm text-neutral-500">
            You can now sign in with your email and password.
          </p>
          <a
            href="/auth/sign-in"
            className="mt-6 inline-block rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity"
          >
            Go to sign in
          </a>
        </div>
      </div>
    )
  }

  const heading = state.hasPassword ? 'Choose a new password' : 'Set your password'
  const subheading = state.hasPassword
    ? `Resetting password for ${state.email}`
    : `Welcome — setting up ${state.email}`

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
          <p className="mt-2 text-sm text-neutral-500">{subheading}</p>
        </div>
        <form
          onSubmit={onSubmit}
          className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm space-y-4"
        >
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-neutral-200 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-foreground mb-1">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-md border border-neutral-200 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
              placeholder="Re-enter the password"
            />
          </div>
          {submitError && <p className="text-sm text-red-600">{submitError}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save password'}
          </button>
        </form>
      </div>
    </div>
  )
}
