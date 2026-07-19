import { describe, expect, it } from 'vitest'
import { readSource } from '../test/read-source'

describe('repository detail fetcher', () => {
  it('exposes an unwrapped detail fetcher for the repository cache', () => {
    const source = readSource('src/lib/api-client.ts')
    expect(source).toContain('export function fetchRepositoryDetailRecord(id: string)')
    expect(source).toContain('repositoriesApi.get(id).then(({ repository }) => repository)')
  })
})
