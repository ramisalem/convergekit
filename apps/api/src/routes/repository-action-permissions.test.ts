import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('repository route action permissions', () => {
  it('keeps repository-wide mutation actions admin-only while MCP tokens stay user-scoped', () => {
    const scopingSource = readFileSync(join(process.cwd(), 'src/lib/scoping.ts'), 'utf8')
    const repositorySource = readFileSync(join(process.cwd(), 'src/routes/repositories.ts'), 'utf8')

    expect(scopingSource).toContain('assertRepoAdminAction')
    expect(scopingSource).toContain('isAllowedAccessPolicyRepository')

    expect(repositorySource).toContain('assertRepoAccess')
    expect(repositorySource).toContain('assertRepoAdminAction')
    expect(repositorySource).toContain('assertAllowedAccessPolicyRepository')
    expect(repositorySource).toContain('verifyGitHubRepositoryVisible')
    expect(repositorySource).toContain('scopedRepositoryIds')
    expect(repositorySource).toContain("repositoryRoutes.post('/:id/reindex'")
    expect(repositorySource).toContain('await assertRepoAdminAction(userId, id)')
    expect(repositorySource).toContain("repositoryRoutes.post('/:id/regenerate-wiki'")
    expect(repositorySource).toContain("repositoryRoutes.delete('/:id'")

    expect(repositorySource).toContain("repositoryRoutes.post('/:id/mcp-tokens'")
    expect(repositorySource).toContain('await assertRepoAccess(userId, repositoryId)')
    expect(repositorySource).toContain('eq(mcpTokens.userId, userId)')
  })
})
