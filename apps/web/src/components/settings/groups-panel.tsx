'use client'

import { useCallback, useEffect, useState } from 'react'
import { ClientTime } from '@/components/ui/client-time'
import type { Group } from '@/lib/api-client'
import { groupsApi } from '@/lib/api-client'
import { GroupsCreateDialog } from './groups-create-dialog'
import { GroupDetailDrawer } from './group-detail-drawer'

type GroupRow = Group & { memberCount: number; repoCount: number }

export function GroupsPanel() {
  const [rows, setRows] = useState<GroupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { groups } = await groupsApi.list()
      const detailed = await Promise.all(
        groups.map(async (g) => {
          try {
            const d = await groupsApi.get(g.id)
            return { ...g, memberCount: d.members.length, repoCount: d.repositories.length }
          } catch {
            return { ...g, memberCount: 0, repoCount: 0 }
          }
        }),
      )
      setRows(detailed)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function deleteGroup(g: Group) {
    if (!confirm(`Delete group "${g.name}"? Members will be unassigned.`)) return
    await groupsApi.delete(g.id)
    void refresh()
  }

  if (loading) {
    return <div className="py-10 text-center text-sm text-neutral-500">Loading groups…</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {rows.length} group{rows.length === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90"
        >
          + New group
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3">Repos</th>
              <th className="px-4 py-3">Created</th>
              <th className="w-20 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-500">
                  No groups yet.
                </td>
              </tr>
            ) : (
              rows.map((g) => (
                <tr
                  key={g.id}
                  className="border-t border-neutral-100 cursor-pointer hover:bg-neutral-50"
                  onClick={() => setSelectedGroupId(g.id)}
                >
                  <td className="px-4 py-3 font-medium">{g.name}</td>
                  <td className="px-4 py-3 text-neutral-600">{g.description ?? '—'}</td>
                  <td className="px-4 py-3 text-neutral-600">{g.memberCount}</td>
                  <td className="px-4 py-3 text-neutral-600">{g.repoCount}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    <ClientTime iso={g.createdAt} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void deleteGroup(g)
                      }}
                      className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <GroupsCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void refresh()}
      />

      <GroupDetailDrawer
        open={selectedGroupId !== null}
        groupId={selectedGroupId}
        onClose={() => setSelectedGroupId(null)}
        onChanged={() => void refresh()}
      />
    </div>
  )
}
