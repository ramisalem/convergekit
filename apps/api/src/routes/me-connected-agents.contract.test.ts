import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./me-connected-agents.ts', import.meta.url), 'utf8')

describe('connected agents routes', () => {
  it('lists and revokes per the signed-in user only', () => {
    expect(source).toContain("get('/connected-agents'")
    expect(source).toContain("delete('/connected-agents/:clientId'")
    expect(source).toContain('listConnectedAgents')
    expect(source).toContain('revokeGrantsForUserClient')
    expect(source).toContain("c.get('userId')")
  })
})
