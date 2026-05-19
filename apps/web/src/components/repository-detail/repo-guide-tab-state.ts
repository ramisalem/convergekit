import type { RepositoryGuideSummary } from '@convergekit/types'

export type RepoGuideViewState = 'preparing' | 'computing-areas' | 'failed' | 'ready' | 'empty'

export function getRepoGuideViewState(input: {
  repositoryStatus: 'pending' | 'processing' | 'done' | 'failed'
  guideStatus: RepositoryGuideSummary['status']
  areaSource: RepositoryGuideSummary['areaSource']
  mindMapStatus: RepositoryGuideSummary['mindMapStatus']
}): RepoGuideViewState {
  if (input.repositoryStatus === 'failed' || input.guideStatus === 'failed') return 'failed'
  if (input.repositoryStatus === 'pending' || input.repositoryStatus === 'processing') {
    return 'preparing'
  }
  if (input.areaSource === 'top_level_path' && input.mindMapStatus === 'failed') {
    return 'ready'
  }
  if (input.areaSource === 'top_level_path' && input.mindMapStatus !== 'done') {
    return 'computing-areas'
  }
  if (input.areaSource === 'none') return 'empty'
  return 'ready'
}

export function getEvidenceLabelTone(
  label: 'Code' | 'Tests' | 'Docs' | 'Design/History' | 'Stale / warning',
) {
  switch (label) {
    case 'Code':
      return 'border-blue-200 bg-blue-50 text-blue-700'
    case 'Tests':
      return 'border-green-200 bg-green-50 text-green-700'
    case 'Docs':
      return 'border-slate-200 bg-slate-50 text-slate-600'
    case 'Design/History':
      return 'border-violet-200 bg-violet-50 text-violet-700'
    case 'Stale / warning':
      return 'border-orange-200 bg-orange-50 text-orange-700'
  }
}

export function shouldShowMetadataRefreshHint(metadataStatus: 'ready' | 'refreshing') {
  return metadataStatus === 'refreshing'
}

export function getAdvancedSettingsHref(locale: string, repositoryId: string) {
  return `/${locale}/repositories/${repositoryId}?tab=settings`
}
