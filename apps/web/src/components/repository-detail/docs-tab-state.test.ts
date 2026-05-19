import { describe, expect, it } from 'vitest'

import { getDocsTabPhase, shouldPollWikiPages } from './docs-tab-state'

describe('docs-tab-state', () => {
  it('keeps polling wiki pages for follow-up regenerate jobs on done repositories', () => {
    expect(shouldPollWikiPages({
      initialStatus: 'done',
      queue: 'mind-map',
      jobStatus: 'completed',
      isDocsFollowUpJob: true,
    })).toBe(true)
  })

  it('does not mark a mind-map follow-up job as done before wiki pages exist', () => {
    expect(getDocsTabPhase({
      initialStatus: 'done',
      queue: 'mind-map',
      jobStatus: 'completed',
      isDocsFollowUpJob: true,
      wikiSections: null,
    })).toBe('mindmap')
  })

  it('switches a mind-map follow-up job into wiki phase once pages exist', () => {
    expect(getDocsTabPhase({
      initialStatus: 'done',
      queue: 'mind-map',
      jobStatus: 'completed',
      isDocsFollowUpJob: true,
      wikiSections: [
        {
          slug: 'getting-started',
          title: 'Getting Started',
          orderIndex: 0,
          summary: null,
          status: 'pending',
          generatedAt: null,
          pages: [
            {
              slug: 'overview',
              title: 'Overview',
              orderIndex: 1,
              summary: null,
              status: 'done',
              generatedAt: null,
            },
            {
              slug: 'installation',
              title: 'Installation',
              orderIndex: 2,
              summary: null,
              status: 'pending',
              generatedAt: null,
            },
          ],
        },
      ],
    })).toBe('wiki')
  })

  it('marks follow-up docs generation done only when all wiki pages are terminal', () => {
    expect(getDocsTabPhase({
      initialStatus: 'done',
      queue: 'mind-map',
      jobStatus: 'completed',
      isDocsFollowUpJob: true,
      wikiSections: [
        {
          slug: 'getting-started',
          title: 'Getting Started',
          orderIndex: 0,
          summary: null,
          status: 'done',
          generatedAt: null,
          pages: [
            {
              slug: 'overview',
              title: 'Overview',
              orderIndex: 1,
              summary: null,
              status: 'done',
              generatedAt: null,
            },
            {
              slug: 'installation',
              title: 'Installation',
              orderIndex: 2,
              summary: null,
              status: 'failed',
              generatedAt: null,
            },
          ],
        },
      ],
    })).toBe('done')
  })
})
