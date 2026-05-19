'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { MultiSelect } from '@/components/ui/multi-select'
import type { ManagedUser } from '@/lib/api-client'
import { usersApi } from '@/lib/api-client'

export function GroupAddMembersDialog({
  open,
  onClose,
  groupId,
  existingMemberIds,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  groupId: string
  existingMemberIds: Set<string>
  onAdded: () => void
}) {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setSelected(new Set())
    setError(null)
    void usersApi
      .list()
      .then((r) => setUsers(r.users))
      .finally(() => setLoading(false))
  }, [open])

  const options = useMemo(
    () =>
      users
        .filter((u) => !existingMemberIds.has(u.id) && u.groupId !== groupId)
        .map((u) => ({ id: u.id, label: u.name, subLabel: u.email })),
    [users, existingMemberIds, groupId],
  )

  async function onSubmit() {
    if (selected.size === 0) return
    setSubmitting(true)
    setError(null)
    try {
      await usersApi.bulkUpdate({ userIds: Array.from(selected), groupId })
      onAdded()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add members')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add members">
      <div className="space-y-4">
        {loading ? (
          <p className="text-sm text-neutral-500">Loading users…</p>
        ) : (
          <MultiSelect
            options={options}
            selected={selected}
            onChange={setSelected}
            placeholder="Search users…"
            emptyLabel="No eligible users"
          />
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || selected.size === 0}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Adding…' : `Add ${selected.size}`}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
