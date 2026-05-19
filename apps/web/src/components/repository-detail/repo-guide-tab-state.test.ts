import { describe, expect, it } from 'vitest'
import {
  getAdvancedSettingsHref,
  getEvidenceLabelTone,
  getRepoGuideViewState,
  shouldShowMetadataRefreshHint,
} from './repo-guide-tab-state'

describe('getRepoGuideViewState', () => {
  it('shows preparing state while repository evidence is indexing', () => {
    expect(
      getRepoGuideViewState({
        repositoryStatus: 'processing',
        guideStatus: 'processing',
        areaSource: 'none',
        mindMapStatus: null,
      }),
    ).toBe('preparing')
  })

  it('shows computing areas when top-level fallback is used after indexing', () => {
    expect(
      getRepoGuideViewState({
        repositoryStatus: 'done',
        guideStatus: 'done',
        areaSource: 'top_level_path',
        mindMapStatus: 'processing',
      }),
    ).toBe('computing-areas')
  })

  it('does not show a forever-computing hint when mind-map generation failed', () => {
    expect(
      getRepoGuideViewState({
        repositoryStatus: 'done',
        guideStatus: 'done',
        areaSource: 'top_level_path',
        mindMapStatus: 'failed',
      }),
    ).toBe('ready')
  })

  it('shows ready when mind-map-backed areas exist', () => {
    expect(
      getRepoGuideViewState({
        repositoryStatus: 'done',
        guideStatus: 'done',
        areaSource: 'mind_map',
        mindMapStatus: 'done',
      }),
    ).toBe('ready')
  })
})

describe('getEvidenceLabelTone', () => {
  it('keeps Docs neutral and Stale warning orange', () => {
    expect(getEvidenceLabelTone('Docs')).toContain('slate')
    expect(getEvidenceLabelTone('Stale / warning')).toContain('orange')
  })
})

describe('shouldShowMetadataRefreshHint', () => {
  it('shows the metadata refresh hint for pre-backfill guide summaries', () => {
    expect(shouldShowMetadataRefreshHint('refreshing')).toBe(true)
    expect(shouldShowMetadataRefreshHint('ready')).toBe(false)
  })
})

describe('getAdvancedSettingsHref', () => {
  it('links the repo guide footer to the advanced settings tab', () => {
    expect(getAdvancedSettingsHref('en', 'repo-123')).toBe(
      '/en/repositories/repo-123?tab=settings',
    )
  })
})
