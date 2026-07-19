'use client'

import { getApiBaseUrl } from '@/lib/runtime-urls'

const API_URL = getApiBaseUrl()

type WorkforceSsoSignInButtonProps = {
  label: string
  disabled?: boolean
  redirectTo?: string | null
}

export function WorkforceSsoSignInButton({
  label,
  disabled = false,
  redirectTo,
}: WorkforceSsoSignInButtonProps) {
  function handleClick() {
    const relayState = encodeURIComponent(redirectTo ?? '/en/repositories')
    window.location.href = `${API_URL}/api/auth/workforce-saml/login?RelayState=${relayState}`
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className="h-10 w-full rounded-md border border-[var(--convergekit-line)] bg-white px-4 text-sm font-medium text-[var(--convergekit-ink)] transition-colors hover:bg-[var(--convergekit-bg-3)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  )
}
