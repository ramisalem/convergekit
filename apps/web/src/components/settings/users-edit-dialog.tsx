'use client'

import { Dialog } from '@/components/ui/dialog'
import type { Group, ManagedUser } from '@/lib/api-client'
import { usersApi } from '@/lib/api-client'
import { useEffect, useState } from 'react'

export function UsersEditDialog({
  open,
  onClose,
  user,
  groups,
  currentUserId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  user: ManagedUser | null
  groups: Group[]
  currentUserId: string | null
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState<'admin' | 'user'>('user')
  const [groupId, setGroupId] = useState('')
  const [ciTokensEnabled, setCiTokensEnabled] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      setName(user.name)
      setRole(user.role)
      setGroupId(user.groupId ?? '')
      setCiTokensEnabled(user.ciTokensEnabled)
      setError(null)
    }
  }, [user])

  const isSelf = user?.id === currentUserId

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    // Disabling the capability revokes the user's active user-level tokens in
    // the same transaction — confirm before applying ANY of the edits, so a
    // decline never half-applies the form.
    const disablingCiTokens = user.ciTokensEnabled && !ciTokensEnabled
    if (
      disablingCiTokens &&
      !confirm(
        `Disable user-level CI tokens for ${user.name}? Their active user-level tokens will be revoked immediately.`,
      )
    ) {
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await usersApi.update(user.id, {
        name,
        role,
        groupId: groupId === '' ? null : groupId,
        ciTokensEnabled,
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={user ? `Edit ${user.name}` : 'Edit user'}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="edit-name" className="block text-sm font-medium mb-1">
            Name
          </label>
          <input
            id="edit-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-neutral-200 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>
        <div>
          <label htmlFor="edit-role" className="block text-sm font-medium mb-1">
            Role
          </label>
          <select
            id="edit-role"
            value={role}
            onChange={(e) => setRole(e.target.value as 'admin' | 'user')}
            disabled={isSelf}
            className="w-full rounded-md border border-neutral-200 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20 disabled:bg-neutral-100 disabled:cursor-not-allowed"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          {isSelf && (
            <p className="mt-1 text-xs text-neutral-500">You cannot change your own role.</p>
          )}
        </div>
        <div>
          <label htmlFor="edit-group" className="block text-sm font-medium mb-1">
            Group
          </label>
          <select
            id="edit-group"
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
        <div>
          <label
            htmlFor="edit-ci-tokens-enabled"
            className="flex items-center justify-between gap-3 text-sm font-medium"
          >
            <span>User-level CI tokens</span>
            <input
              id="edit-ci-tokens-enabled"
              type="checkbox"
              checked={ciTokensEnabled}
              onChange={(e) => setCiTokensEnabled(e.target.checked)}
              disabled={submitting}
              className="h-4 w-4 rounded border-neutral-300"
            />
          </label>
          <p className="mt-1 text-xs text-neutral-500">
            Lets this person create and manage their own CI / automation tokens. Disabling it
            immediately revokes their user-level CI tokens — it does not affect grandfathered
            per-repo tokens or connected OAuth agents.
          </p>
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
