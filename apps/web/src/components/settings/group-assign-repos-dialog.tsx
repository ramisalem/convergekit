'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { MultiSelect } from '@/components/ui/multi-select'
import { groupsApi, repositoriesApi } from '@/lib/api-client'

type RepoChoice = { id: string; name: string; cloneUrl: string }

export function GroupAssignReposDialog({
  open,
  onClose,
  groupId,
  assignedRepoIds,
  onAssigned,
}: {
  open: boolean
  onClose: () => void
  groupId: string
  assignedRepoIds: Set<string>
  onAssigned: () => void
}) {
  const [repos, setRepos] = useState<RepoChoice[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setSelected(new Set())
    setError(null)
    void repositoriesApi
      .list()
      .then((r) =>
        setRepos(r.repositories.map((x) => ({ id: x.id, name: x.name, cloneUrl: x.cloneUrl }))),
      )
      .finally(() => setLoading(false))
  }, [open])

  const options = useMemo(
    () =>
      repos
        .filter((r) => !assignedRepoIds.has(r.id))
        .map((r) => ({ id: r.id, label: r.name, subLabel: r.cloneUrl })),
    [repos, assignedRepoIds],
  )

  async function onSubmit() {
    if (selected.size === 0) return
    setSubmitting(true)
    setError(null)
    try {
      await groupsApi.assignRepos(groupId, Array.from(selected))
      onAssigned()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Assign repositories">
      <div className="space-y-4">
        {loading ? (
          <p className="text-sm text-neutral-500">Loading repositories…</p>
        ) : (
          <MultiSelect
            options={options}
            selected={selected}
            onChange={setSelected}
            placeholder="Search repositories…"
            emptyLabel="No unassigned repositories"
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
            {submitting ? 'Assigning…' : `Assign ${selected.size}`}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
