import { describe, expect, it } from 'vitest'
import { readSource } from '../../test/read-source'

describe('repo guide mockup layout', () => {
  it('renders the mockup two-lens guide instead of the old stacked coaching layout', () => {
    const source = readSource('src/components/repository-detail/repo-guide-tab.tsx')

    expect(source).toContain('CurrentRepoGuide')
    expect(source).toContain('ProposedRepoGuide')
    expect(source).toContain('ConfidenceMeter')
    expect(source).toContain('TierLegend')
    expect(source).toContain('w-full')
    expect(source).toContain('guide.questionCards')
    expect(source).toContain(
      'grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]',
    )
    expect(source).toContain('Coverage by repository area')
    expect(source).toContain('What we can answer with high confidence')
    expect(source).toContain('Reading both:')
    expect(source).not.toContain('max-w-[90rem]')
    expect(source).not.toContain('Proposed · question-first')
    expect(source).not.toContain('All routes')
    expect(source).not.toContain('<CoachingPanel')
    expect(source).not.toContain('<HowToReadPanel')
    expect(source).not.toContain('<PhrasingTip')
  })
})
