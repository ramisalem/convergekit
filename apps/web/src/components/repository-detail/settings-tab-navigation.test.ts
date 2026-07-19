import { describe, expect, it } from 'vitest'
import { readSource } from '../../test/read-source'

describe('settings tab navigation', () => {
  const source = readSource('src/components/repository-detail/settings-tab.tsx')

  it('uses router.push for reindex and regenerate, not full reloads', () => {
    expect(source).not.toContain('window.location.href =')
    expect(source).toContain(
      'router.push(`/${params.locale}/repositories/${repositoryId}?tab=docs&jobId=${jobId}`)',
    )
    expect(source).toContain(
      'router.push(`/${params.locale}/repositories/${repositoryId}?tab=docs&jobId=${jobId}&queue=${encodeURIComponent(queueName)}`)',
    )
  })
})
