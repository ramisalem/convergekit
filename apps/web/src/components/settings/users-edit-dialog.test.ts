import { describe, expect, it } from 'vitest'
import { readSource } from '../../test/read-source'

describe('UsersEditDialog — User-level CI tokens capability toggle', () => {
  it('renders a "User-level CI tokens" toggle synced from the user and saved via usersApi.update', () => {
    const source = readSource('src/components/settings/users-edit-dialog.tsx')
    expect(source).toContain('User-level CI tokens')
    expect(source).toContain('setCiTokensEnabled(user.ciTokensEnabled)')
    expect(source).toContain('checked={ciTokensEnabled}')
    expect(source).toContain('usersApi.update(user.id, {')

    const updateCallIndex = source.indexOf('usersApi.update(user.id, {')
    const updateCallEnd = source.indexOf('})', updateCallIndex)
    expect(updateCallEnd).toBeGreaterThan(updateCallIndex)
    const updateCall = source.slice(updateCallIndex, updateCallEnd)
    expect(updateCall).toContain('ciTokensEnabled')
  })

  it('help text states the disable side-effect precisely: user-level tokens only, not legacy or OAuth agents', () => {
    const source = readSource('src/components/settings/users-edit-dialog.tsx')
    // Whitespace-normalized so Prettier's exact line-wrapping can't break this assertion.
    const normalized = source.replace(/\s+/g, ' ')
    expect(normalized).toMatch(/revokes their user-level CI tokens/i)
    expect(normalized).toMatch(
      /does not affect grandfathered per-repo tokens or connected OAuth agents/i,
    )
  })

  it('does NOT self-guard the CI toggle — isSelf still guards role, but a sole admin must be able to enable themselves', () => {
    const source = readSource('src/components/settings/users-edit-dialog.tsx')
    // Only the role <select> carries the self-guard.
    expect(source.match(/disabled=\{isSelf\}/g)).toHaveLength(1)

    const toggleIndex = source.indexOf('id="edit-ci-tokens-enabled"')
    expect(toggleIndex).toBeGreaterThan(-1)
    const toggleInputEnd = source.indexOf('/>', toggleIndex)
    const toggleMarkup = source.slice(toggleIndex, toggleInputEnd)
    // No SELF-guard — but the toggle does lock while a save is in flight, so a
    // click can't flip state between request and response.
    expect(toggleMarkup).not.toContain('disabled={isSelf}')
    expect(toggleMarkup).toContain('disabled={submitting}')
  })

  it('confirm-guards the capability disable: only a true→false transition prompts, and a decline aborts the whole save', () => {
    const source = readSource('src/components/settings/users-edit-dialog.tsx')
    // Transition condition — enabling (or leaving the flag alone) must not prompt.
    expect(source).toContain('user.ciTokensEnabled && !ciTokensEnabled')

    const normalized = source.replace(/\s+/g, ' ')
    expect(normalized).toMatch(
      /!confirm\( ?`Disable user-level CI tokens for \$\{user\.name\}\? Their active user-level tokens will be revoked immediately\.`/,
    )

    // The guard runs before the API call, so declining applies nothing — not a
    // partial save with the flag change skipped.
    const confirmIndex = source.indexOf('confirm(')
    expect(confirmIndex).toBeGreaterThan(-1)
    expect(confirmIndex).toBeLessThan(source.indexOf('usersApi.update('))
  })
})
