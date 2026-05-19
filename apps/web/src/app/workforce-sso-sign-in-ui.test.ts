import { describe, expect, it } from 'vitest'
import { readSource } from '../test/read-source'

describe('workforce SSO sign-in UI', () => {
  it('uses workforce SSO as the primary user sign-in path and keeps GitHub on the admin tab', () => {
    const signInSource = readSource('src/app/[locale]/auth/sign-in/page.tsx')
    const messagesSource = readSource('messages/en.json')

    expect(signInSource).toContain('WorkforceSsoSignInButton')
    expect(signInSource).toContain('authConfigApi')
    expect(signInSource).toContain('.getConfig()')
    expect(signInSource).toContain('workforceSsoEnabled')
    expect(signInSource).toContain('workforceSsoProviderLabel')
    expect(signInSource).toContain("t('invitedAccountSeparator')")
    expect(signInSource).not.toContain(['Google', 'SignIn', 'Button'].join(''))
    expect(signInSource).not.toContain('sign-in/social')
    expect(messagesSource).toContain('or sign in with an invited account')
  })

  it('renders a neutral loading skeleton while /api/auth/config is in-flight to avoid flashing the disabled SSO state', () => {
    const signInSource = readSource('src/app/[locale]/auth/sign-in/page.tsx')

    expect(signInSource).toContain('useState<boolean | null>(null)')
    expect(signInSource).toContain('workforceSsoEnabled === null')
    expect(signInSource).toContain('animate-pulse')
  })

  it('only renders the email/password fallback when workforce SSO is explicitly disabled', () => {
    const signInSource = readSource('src/app/[locale]/auth/sign-in/page.tsx')

    // The email form, password field, and invited-account divider must be gated on the
    // explicitly-disabled state so they stay hidden when SSO is enabled or still loading.
    expect(signInSource).toContain('workforceSsoEnabled === false &&')
    const gatedBlockStart = signInSource.indexOf('workforceSsoEnabled === false &&')
    expect(gatedBlockStart).toBeGreaterThan(-1)
    const gatedBlock = signInSource.slice(gatedBlockStart)
    expect(gatedBlock).toContain("t('invitedAccountSeparator')")
    expect(gatedBlock).toContain('handleEmailSignIn')
    expect(gatedBlock).toContain('type="password"')
  })
})
