import { readSource } from '../test/read-source'
import { describe, expect, it } from 'vitest'

describe('sign-in error surface', () => {
  it('surfaces API error payloads returned by access policy sign-in guards', () => {
    const source = readSource('src/app/[locale]/auth/sign-in/page.tsx')

    expect(source).toContain("body?.message ?? body?.error ?? 'Invalid email or password'")
    expect(source).not.toContain("body?.message ?? 'Invalid email or password'")
  })
})
