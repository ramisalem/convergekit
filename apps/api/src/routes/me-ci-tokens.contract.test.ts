import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const src = readFileSync(new URL('./me-ci-tokens.ts', import.meta.url), 'utf8')
const svc = readFileSync(new URL('../lib/ci-token-service.ts', import.meta.url), 'utf8')
const app = readFileSync(new URL('../app.ts', import.meta.url), 'utf8')
describe('me-ci-tokens router', () => {
  it('mounts under /me (requireAuth)', () => {
    expect(app).toContain("app.route('/me', meCiTokenRoutes)")
  })
  it('the row-locked create/renew body lives in ci-token-service (the hookable seam)', () => {
    // The lock + capability gate is in the extracted function, NOT the route —
    // this is what lets the integration suite inject the afterLock/beforeCommit hooks.
    expect(svc).toContain('export async function createUserLevelToken')
    expect(svc).toContain('export async function renewUserLevelToken')
    expect(svc).toContain(".for('update')") // drizzle SELECT … FOR UPDATE
    expect(svc).toContain('ciTokensEnabled') // capability gate, under the lock
    expect(svc).toContain('deactivatedAt')
    expect(svc).toContain('hooks?.afterLock') // pinned barrier seam
    expect(svc).toContain('hooks?.beforeCommit') // pinned rollback seam
    expect(svc).toContain('repositoryId: null') // user-level rows
  })
  it('the route is a thin caller: opens a transaction and delegates, no inline lock', () => {
    expect(src).toContain('db.transaction')
    expect(src).toContain('createUserLevelToken(tx')
    expect(src).toContain('renewUserLevelToken(tx')
    expect(src).not.toContain(".for('update')") // the lock is NOT in the route
  })
  it('scopes every query to the caller and to user-level rows', () => {
    expect(src).toContain("c.get('userId')")
    expect(src).toContain('isNull(mcpTokens.repositoryId)')
    // The any-shape, any-owner lookup is oversight-only — it must never enter this router.
    expect(src).not.toContain('assertAnyCiToken')
  })
  it('exposes caller legacy list + revoke', () => {
    expect(src).toContain("meCiTokenRoutes.get('/ci-tokens/legacy'")
    expect(src).toContain("meCiTokenRoutes.delete('/ci-tokens/legacy/:tokenId'")
    // Legacy tokens still raise alerts — the owner's list must carry real counts.
    expect(src).toContain('getOpenAlertCountsByToken')
  })
  it('the legacy list response includes repository via serializeLegacyCiToken', () => {
    expect(svc).toContain('serializeLegacyCiToken')
    expect(src).toContain('serializeLegacyCiToken')
  })
})
