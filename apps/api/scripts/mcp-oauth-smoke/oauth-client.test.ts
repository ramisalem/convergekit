import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { pkcePair } from './oauth-client.js'

describe('pkcePair', () => {
  it('produces an S256 challenge that is the base64url sha256 of the verifier', () => {
    const { verifier, challenge } = pkcePair()
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
  })

  it('produces a fresh verifier each call', () => {
    expect(pkcePair().verifier).not.toBe(pkcePair().verifier)
  })
})
