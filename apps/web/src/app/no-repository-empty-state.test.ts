import { describe, expect, it } from 'vitest'
import { readSource } from '../test/read-source'

describe('no repository assigned empty state', () => {
  it('shows support contacts for regular users with no repositories', () => {
    const userNavSource = readSource('src/components/user-nav.tsx')
    expect(userNavSource).toContain('supportContacts')

    const repoSource = readSource('src/app/[locale]/repositories/page.tsx')
    expect(repoSource).toContain('NoRepositoriesAssignedState')
    expect(repoSource).toContain('supportContacts')
    expect(repoSource).toContain('mailto:')
    expect(repoSource).not.toContain('No repositories have been assigned to your group yet.')
  })
})
