export type RepositoryTab = 'docs' | 'guide' | 'chat' | 'settings' | 'files'
export type VisibleRepositoryTab = Exclude<RepositoryTab, 'files'>

const ADMIN_TABS: VisibleRepositoryTab[] = ['docs', 'guide', 'chat', 'settings']
const USER_TABS: VisibleRepositoryTab[] = ['guide', 'chat', 'settings']

export function normalizeRepositoryTab(value: string | null): RepositoryTab {
  if (value === 'structure') return 'guide'
  if (
    value === 'docs' ||
    value === 'guide' ||
    value === 'chat' ||
    value === 'settings' ||
    value === 'files'
  ) {
    return value
  }
  return 'chat'
}

export function getAvailableRepositoryTabs(isAdmin: boolean): VisibleRepositoryTab[] {
  return isAdmin ? ADMIN_TABS : USER_TABS
}

export function getEffectiveRepositoryTab(
  tab: RepositoryTab,
  isAdmin: boolean,
): VisibleRepositoryTab {
  const available = getAvailableRepositoryTabs(isAdmin)
  return available.includes(tab as VisibleRepositoryTab) ? (tab as VisibleRepositoryTab) : 'guide'
}
