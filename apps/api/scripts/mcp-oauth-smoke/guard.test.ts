import { describe, expect, it } from 'vitest'
import { assertLocalDatabase, parseDbHost } from './guard.js'

describe('parseDbHost', () => {
  it('extracts the lowercased hostname', () => {
    expect(parseDbHost('postgresql://convergekit:secret@postgres:5432/convergekit')).toBe('postgres')
    expect(parseDbHost('postgresql://u:p@LocalHost:5432/db')).toBe('localhost')
  })
})

describe('assertLocalDatabase', () => {
  it('allows loopback hosts', () => {
    for (const url of [
      'postgresql://u:p@localhost:5432/db',
      'postgresql://u:p@127.0.0.1:5432/db',
      'postgresql://u:p@[::1]:5432/db',
    ]) {
      expect(() => assertLocalDatabase(url)).not.toThrow()
    }
  })

  it('refuses non-loopback hosts (incl. the container-only `postgres` name)', () => {
    for (const url of [
      'postgresql://u:p@postgres:5432/db',
      'postgresql://u:p@db.cluster-x.us-east-1.rds.amazonaws.com:5432/convergekit',
    ]) {
      expect(() => assertLocalDatabase(url)).toThrow(/not local/)
    }
  })

  it('refuses when unset or unparseable', () => {
    expect(() => assertLocalDatabase(undefined)).toThrow(/not set/)
    expect(() => assertLocalDatabase('not-a-url')).toThrow(/valid URL/)
  })
})
