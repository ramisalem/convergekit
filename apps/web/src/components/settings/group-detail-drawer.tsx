'use client'

import { useCallback, useEffect, useState } from 'react'
import { Drawer } from '@/components/ui/drawer'
import type { Group } from '@/lib/api-client'
import { groupsApi, usersApi } from '@/lib/api-client'
import { GroupAddMembersDialog } from './group-add-members-dialog'
import { GroupAssignReposDialog } from './group-assign-repos-dialog'
import { GroupsEditDialog } from './groups-edit-dialog'

type Detail = {
  group: Group
  members: Array<{ id: string; name: string; email: string; image: string | null }>
  repositories: Array<{ repositoryId: string; name: string; assignedAt: string }>
}

export function GroupDetailDrawer({
  open,
  groupId,
  onClose,
  onChanged,
}: {
  open: boolean
  groupId: string | null
  onClose: () => void
  onChanged: () => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [addMembersOpen, setAddMembersOpen] = useState(false)
  const [assignReposOpen, setAssignReposOpen] = useState(false)

  const refresh = useCallback(async () => {
    if (!groupId) return
    setLoading(true)
    try {
      const d = await groupsApi.get(groupId)
      setDetail(d as Detail)
    } finally {
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => {
    if (open && groupId) void refresh()
    if (!open) setDetail(null)
  }, [open, groupId, refresh])

  async function removeMember(userId: string) {
    if (!detail) return
    if (!confirm('Remove this member from the group?')) return
    await usersApi.update(userId, { groupId: null })
    await refresh()
    onChanged()
  }

  async function unassignRepo(repoId: string) {
    if (!detail) return
    if (!confirm('Unassign this repository?')) return
    await groupsApi.unassignRepo(detail.group.id, repoId)
    await refresh()
    onChanged()
  }

  const memberIds = new Set(detail?.members.map((m) => m.id) ?? [])
  const repoIds = new Set(detail?.repositories.map((r) => r.repositoryId) ?? [])

  return (
    <>
      <Drawer open={open} onClose={onClose} title={detail?.group.name ?? 'Group'}>
        {loading || !detail ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : (
          <div className="space-y-8">
            <section>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold">{detail.group.name}</h3>
                  {detail.group.description && (
                    <p className="mt-1 text-sm text-neutral-600">{detail.group.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium hover:bg-neutral-50"
                >
                  Edit
                </button>
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Members ({detail.members.length})</h4>
                <button
                  type="button"
                  onClick={() => setAddMembersOpen(true)}
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium hover:bg-neutral-50"
                >
                  + Add members
                </button>
              </div>
              {detail.members.length === 0 ? (
                <p className="text-sm text-neutral-500">No members yet.</p>
              ) : (
                <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
                  {detail.members.map((m) => {
                    const initials = (m.name?.[0] ?? m.email?.[0] ?? '?').toUpperCase()
                    return (
                      <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                        {m.image ? (
                          <img
                            src={m.image}
                            alt=""
                            className="h-7 w-7 rounded-full ring-1 ring-neutral-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                            {initials}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium">{m.name}</p>
                          <p className="truncate text-xs text-neutral-500">{m.email}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMember(m.id)}
                          className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium hover:bg-neutral-50"
                        >
                          Remove
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold">
                  Repositories ({detail.repositories.length})
                </h4>
                <button
                  type="button"
                  onClick={() => setAssignReposOpen(true)}
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium hover:bg-neutral-50"
                >
                  + Assign repos
                </button>
              </div>
              {detail.repositories.length === 0 ? (
                <p className="text-sm text-neutral-500">No repositories assigned.</p>
              ) : (
                <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
                  {detail.repositories.map((r) => (
                    <li key={r.repositoryId} className="flex items-center gap-3 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium">{r.name}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => unassignRepo(r.repositoryId)}
                        className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium hover:bg-neutral-50"
                      >
                        Unassign
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </Drawer>

      <GroupsEditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        group={detail?.group ?? null}
        onSaved={() => {
          void refresh()
          onChanged()
        }}
      />

      {detail && (
        <>
          <GroupAddMembersDialog
            open={addMembersOpen}
            onClose={() => setAddMembersOpen(false)}
            groupId={detail.group.id}
            existingMemberIds={memberIds}
            onAdded={() => {
              void refresh()
              onChanged()
            }}
          />
          <GroupAssignReposDialog
            open={assignReposOpen}
            onClose={() => setAssignReposOpen(false)}
            groupId={detail.group.id}
            assignedRepoIds={repoIds}
            onAssigned={() => {
              void refresh()
              onChanged()
            }}
          />
        </>
      )}
    </>
  )
}
