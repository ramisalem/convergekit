'use client'

import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import type { Group } from '@/lib/api-client'
import { groupsApi } from '@/lib/api-client'

export function GroupsEditDialog({
  open,
  onClose,
  group,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  group: Group | null
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (group) {
      setName(group.name)
      setDescription(group.description ?? '')
      setError(null)
    }
  }, [group])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!group) return
    setError(null)
    setSubmitting(true)
    try {
      await groupsApi.update(group.id, { name, description: description || undefined })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={group ? `Edit ${group.name}` : 'Edit group'}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="group-edit-name" className="block text-sm font-medium mb-1">
            Name
          </label>
          <input
            id="group-edit-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-neutral-200 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>
        <div>
          <label htmlFor="group-edit-description" className="block text-sm font-medium mb-1">
            Description
          </label>
          <textarea
            id="group-edit-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-neutral-200 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
