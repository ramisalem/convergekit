'use client'

import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import type { Group } from '@/lib/api-client'
import { usersApi } from '@/lib/api-client'

export function UsersInviteDialog({
  open,
  onClose,
  groups,
  onInvited,
}: {
  open: boolean
  onClose: () => void
  groups: Group[]
  onInvited: (inviteUrl: string) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'user'>('user')
  const [groupId, setGroupId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setName('')
    setEmail('')
    setRole('user')
    setGroupId('')
    setError(null)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await usersApi.invite({
        name,
        email,
        role,
        groupId: groupId || undefined,
      })
      onInvited(result.inviteUrl)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title="Invite user"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="invite-name" className="block text-sm font-medium mb-1">
            Name
          </label>
          <input
            id="invite-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-neutral-200 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>
        <div>
          <label htmlFor="invite-email" className="block text-sm font-medium mb-1">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-neutral-200 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>
        <div>
          <label htmlFor="invite-role" className="block text-sm font-medium mb-1">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as 'admin' | 'user')}
            className="w-full rounded-md border border-neutral-200 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <label htmlFor="invite-group" className="block text-sm font-medium mb-1">
            Group (optional)
          </label>
          <select
            id="invite-group"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="w-full rounded-md border border-neutral-200 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
          >
            <option value="">None</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              reset()
              onClose()
            }}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create & generate invite link'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
