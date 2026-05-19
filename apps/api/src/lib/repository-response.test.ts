import { describe, expect, it } from 'vitest'
import { serializeRepositoryForResponse, sanitizeCloneUrlForDisplay } from './repository-response.js'

const baseRepository = {
  id: '8c8e7c75-9a8d-4ef2-877b-5fb8a68ab741',
  name: 'example-backend',
  cloneUrl: 'https://github.com/example-org/example-backend.git',
  provider: 'github' as const,
  defaultBranch: 'main',
  isPrivate: true,
  status: 'done' as const,
  userId: 'user-1',
  createdAt: new Date('2026-04-26T00:00:00.000Z'),
  updatedAt: new Date('2026-04-26T00:00:00.000Z'),
  deletedAt: null,
}

describe('sanitizeCloneUrlForDisplay', () => {
  it('removes embedded OAuth credentials from HTTPS clone URLs', () => {
    expect(
      sanitizeCloneUrlForDisplay(
        'https://x-oauth-token:gho_secret-value@github.com/example-org/example-backend.git',
      ),
    ).toBe('https://github.com/example-org/example-backend.git')
  })

  it('leaves public HTTPS clone URLs unchanged', () => {
    expect(sanitizeCloneUrlForDisplay('https://github.com/example-org/example-backend.git')).toBe(
      'https://github.com/example-org/example-backend.git',
    )
  })
})

describe('serializeRepositoryForResponse', () => {
  it('never exposes token-bearing clone URLs in API repository responses', () => {
    const repository = serializeRepositoryForResponse({
      ...baseRepository,
      cloneUrl: 'https://x-oauth-token:gho_secret-value@github.com/example-org/example-backend.git',
    })

    expect(repository.cloneUrl).toBe('https://github.com/example-org/example-backend.git')
    expect(repository.cloneUrl).not.toContain('x-oauth-token')
    expect(repository.cloneUrl).not.toContain('gho_secret-value')
  })
})
