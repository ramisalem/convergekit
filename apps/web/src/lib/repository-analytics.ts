import type { RepositoryTab } from '@/components/repository-detail/repository-tabs-state'

type RepositoryDetailEventName =
  | 'repository_landing'
  | 'repo_guide_impression'
  | 'repository_tab_change'
  | 'repository_chat_start'
  | 'repository_advanced_settings_open'

export function trackRepositoryDetailEvent(input: {
  name: RepositoryDetailEventName
  repositoryId: string
  tab: RepositoryTab
}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('convergekit:repository-detail', { detail: input }))
}
