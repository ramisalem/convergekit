import { describe, expect, it } from 'vitest'
import { readSource } from '../test/read-source'
import en from '../../messages/en.json'

describe('indexing failure copy', () => {
  it('docs tab prefers the live job error, then the persisted failure', () => {
    const source = readSource('src/components/repository-detail/docs-tab.tsx')
    expect(source).toContain('const failureMessage = jobError ?? indexingFailure?.message')
    expect(source).toContain("{t('indexingFailedDescription')}")
  })

  it('keeps the generic helper copy stable', () => {
    expect(en.repositoryDetail.docs.indexingFailedDescription).toBe(
      'Resolve the issue above, then re-index from Advanced Settings.',
    )
  })
})
