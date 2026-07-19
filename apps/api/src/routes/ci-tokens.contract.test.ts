import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./ci-tokens.ts', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../app.ts', import.meta.url), 'utf8')

describe('admin CI token routes', () => {
  it('mounts under the admin-gated /admin area', () => {
    expect(appSource).toContain("app.use('/admin/*', requireAuth, requireAdmin)")
    expect(appSource).toContain("app.route('/admin/ci-tokens', ciTokenRoutes)")
  })

  it('drops create/renew/test — minting, rotation, and connection-testing are self-service via /api/me/ci-tokens', () => {
    expect(source).not.toContain("ciTokenRoutes.post('/'")
    expect(source).not.toContain("ciTokenRoutes.post('/:tokenId/renew'")
    expect(source).not.toContain("ciTokenRoutes.post('/:tokenId/test'")
    expect(source).not.toContain('createCiTokenSchema')
    expect(source).not.toContain('testCiConnectionSchema')
    expect(source).not.toContain('issueCiToken')
  })

  it('lists every user-level token newest-first with owner attribution and batched alert counts', () => {
    expect(source).toContain("ciTokenRoutes.get('/'")
    expect(source).toContain('isNull(mcpTokens.repositoryId)')
    expect(source).toContain('desc(mcpTokens.createdAt)')
    expect(source).toContain('owner: {')
    expect(source).toContain('getOpenAlertCountsByToken')
  })

  it('revokes any user-level token — admin_revoke unless the admin is revoking their own', () => {
    expect(source).toContain("ciTokenRoutes.delete('/:tokenId'")
    expect(source).toContain("revokedReason: isOwnToken ? 'user_revoke' : 'admin_revoke'")
  })

  it('lists every legacy repo-scoped token with owner AND repository', () => {
    expect(source).toContain("ciTokenRoutes.get('/legacy'")
    expect(source).toContain('isNotNull(mcpTokens.repositoryId)')
    expect(source).toContain('serializeLegacyCiToken')

    const legacyListBlock = source.slice(
      source.indexOf("ciTokenRoutes.get('/legacy'"),
      source.indexOf("ciTokenRoutes.delete('/legacy/:tokenId'"),
    )
    expect(legacyListBlock).toContain('owner: {')
    expect(legacyListBlock).toContain('repository:')
    expect(legacyListBlock).toContain('getOpenAlertCountsByToken')
  })

  it('revokes any legacy token — admin_revoke, scoped so it can never touch a user-level row', () => {
    expect(source).toContain("ciTokenRoutes.delete('/legacy/:tokenId'")

    const legacyDeleteBlock = source.slice(
      source.indexOf("ciTokenRoutes.delete('/legacy/:tokenId'"),
      source.indexOf("ciTokenRoutes.get('/:tokenId/config'"),
    )
    expect(legacyDeleteBlock).toContain("revokedReason: 'admin_revoke'")
    expect(legacyDeleteBlock).toContain('isNotNull(mcpTokens.repositoryId)')
  })

  it('serves config to user-level tokens only, still gated by assertCiToken', () => {
    expect(source).toContain("ciTokenRoutes.get('/:tokenId/config'")
    expect(source).toContain('buildMcpTokenConfig')

    const configBlock = source.slice(
      source.indexOf("ciTokenRoutes.get('/:tokenId/config'"),
      source.indexOf("ciTokenRoutes.get('/:tokenId/audit'"),
    )
    expect(configBlock).toContain('assertCiToken(')
    expect(configBlock).not.toContain('assertAnyCiToken(')
  })

  it('serves audit, alerts, and acknowledge for either token shape via assertAnyCiToken', () => {
    expect(source).toContain("ciTokenRoutes.get('/:tokenId/audit'")
    expect(source).toContain("ciTokenRoutes.get('/:tokenId/alerts'")
    expect(source).toContain("ciTokenRoutes.post('/:tokenId/alerts/:alertId/acknowledge'")

    const oversightBlock = source.slice(
      source.indexOf("ciTokenRoutes.get('/:tokenId/audit'"),
      source.indexOf("ciTokenRoutes.delete('/:tokenId'"),
    )
    expect(oversightBlock).toContain('assertAnyCiToken(')
    expect(oversightBlock).not.toContain('assertCiToken(')
  })

  it('revoke-any is user-level only: legacy ids get an explicit redirect, WHERE pins the shape', () => {
    const deleteBlock = source.slice(source.indexOf("ciTokenRoutes.delete('/:tokenId'"))
    expect(deleteBlock).toContain('assertAnyCiToken(')
    expect(deleteBlock).toContain('repositoryId !== null')
    expect(deleteBlock).toContain('ValidationError')
    expect(deleteBlock).toContain('/api/admin/ci-tokens/legacy/:tokenId')
    // Defense-in-depth: even past the shape branch, the UPDATE itself is shape-pinned.
    expect(deleteBlock).toContain('isNull(mcpTokens.repositoryId)')
  })
})
