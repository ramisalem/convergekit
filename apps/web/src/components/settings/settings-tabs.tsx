'use client'

import type { AccessPolicySettings } from '@/lib/api-client'
import { useState, type ReactNode } from 'react'
import { AccessPolicyPanel } from './access-policy-panel'
import { GroupsPanel } from './groups-panel'
import { UsersPanel } from './users-panel'

type TabId = 'ai' | 'users' | 'groups' | 'access-policy'

export function SettingsTabs({
  aiPanel,
  currentUserId,
  accessPolicy,
}: {
  aiPanel: ReactNode
  currentUserId: string | null
  accessPolicy: AccessPolicySettings
}) {
  const [tab, setTab] = useState<TabId>('ai')

  return (
    <div className="space-y-6">
      <div className="border-b border-neutral-200">
        <nav className="-mb-px flex gap-6" aria-label="Settings tabs">
          <TabButton id="ai" active={tab} onClick={setTab}>
            AI provider
          </TabButton>
          <TabButton id="users" active={tab} onClick={setTab}>
            Users
          </TabButton>
          <TabButton id="groups" active={tab} onClick={setTab}>
            Groups
          </TabButton>
          <TabButton id="access-policy" active={tab} onClick={setTab}>
            Access policy
          </TabButton>
        </nav>
      </div>

      {tab === 'ai' && <div>{aiPanel}</div>}
      {tab === 'users' && <UsersPanel currentUserId={currentUserId} />}
      {tab === 'groups' && <GroupsPanel />}
      {tab === 'access-policy' && <AccessPolicyPanel policy={accessPolicy} />}
    </div>
  )
}

function TabButton({
  id,
  active,
  onClick,
  children,
}: {
  id: TabId
  active: TabId
  onClick: (id: TabId) => void
  children: ReactNode
}) {
  const isActive = active === id
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
        isActive
          ? 'border-foreground text-foreground'
          : 'border-transparent text-neutral-500 hover:text-foreground hover:border-neutral-300'
      }`}
    >
      {children}
    </button>
  )
}
