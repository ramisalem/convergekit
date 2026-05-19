import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AccessPolicyPanel', () => {
  it('renders policy values as read-only deployment configuration', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/settings/access-policy-panel.tsx'),
      'utf8',
    )

    expect(source).toContain('allowedEmailDomain')
    expect(source).toContain('allowedGitHubOrg')
    expect(source).toContain('allowedRepositoryHost')
    expect(source).toContain("policy.allowedEmailDomain ?? 'Not restricted'")
    expect(source).toContain("policy.allowedGitHubOrg ?? 'Not restricted'")
    expect(source).toContain('Deployment configuration')
    expect(source).not.toContain('<input')
    expect(source).not.toContain('<form')
    expect(source).not.toContain('onSubmit')
  })
})
