'use client'

import type { Group, ManagedUser } from '@/lib/api-client'
import { groupsApi, usersApi } from '@/lib/api-client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { UsersEditDialog } from './users-edit-dialog'
import { UsersInviteDialog } from './users-invite-dialog'
import { UsersUrlRevealDialog } from './users-url-reveal-dialog'

type RevealState = {
  open: boolean
  url: string | null
  title: string
  helperText: string
}

export function UsersPanel({ currentUserId }: { currentUserId: string | null }) {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editUser, setEditUser] = useState<ManagedUser | null>(null)
  const [reveal, setReveal] = useState<RevealState>({
    open: false,
    url: null,
    title: '',
    helperText: '',
  })
  const [bulkGroupChoice, setBulkGroupChoice] = useState<string>('')
  const [bulkRoleChoice, setBulkRoleChoice] = useState<string>('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [u, g] = await Promise.all([usersApi.list(), groupsApi.list()])
      setUsers(u.users)
      setGroups(g.groups)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const groupsById = useMemo(() => {
    const m = new Map<string, Group>()
    for (const g of groups) m.set(g.id, g)
    return m
  }, [groups])

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(users.map((u) => u.id)) : new Set())
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function resendInvite(userId: string) {
    const res = await usersApi.resendInvite(userId)
    setReveal({
      open: true,
      url: res.inviteUrl,
      title: 'Invite link',
      helperText: 'Share this link with the user. It expires in 7 days.',
    })
    void refresh()
  }

  async function resetPassword(user: ManagedUser) {
    if (!confirm(`Issue a password-reset link for ${user.name}?`)) return
    const res = await usersApi.resetPassword(user.id)
    setReveal({
      open: true,
      url: res.resetUrl,
      title: 'Password reset link',
      helperText:
        'Share this link with the user so they can choose a new password. It expires in 7 days.',
    })
    void refresh()
  }

  async function deleteUser(u: ManagedUser) {
    if (u.id === currentUserId) return
    if (!confirm(`Delete ${u.name}? This cannot be undone.`)) return
    await usersApi.delete(u.id)
    void refresh()
  }

  async function revokeUserMcpTokens(u: ManagedUser) {
    if (!confirm(`Revoke all active MCP tokens for ${u.name}?`)) return
    const result = await usersApi.revokeAllMcpTokens(u.id)
    alert(`Revoked ${result.revoked} MCP token${result.revoked === 1 ? '' : 's'}.`)
    void refresh()
  }

  async function deactivateUser(u: ManagedUser) {
    if (u.id === currentUserId) return
    if (!confirm(`Deactivate ${u.name}? Active sessions and MCP tokens will be revoked.`)) return
    const result = await usersApi.deactivate(u.id)
    alert(
      `Deactivated ${u.name}. Revoked ${result.revoked} MCP token${result.revoked === 1 ? '' : 's'}.`,
    )
    void refresh()
  }

  async function reactivateUser(u: ManagedUser) {
    if (!confirm(`Reactivate ${u.name}?`)) return
    await usersApi.reactivate(u.id)
    void refresh()
  }

  async function applyBulkGroup() {
    if (!bulkGroupChoice) return
    const ids = Array.from(selected)
    await usersApi.bulkUpdate({
      userIds: ids,
      groupId: bulkGroupChoice === '__none__' ? null : bulkGroupChoice,
    })
    setSelected(new Set())
    setBulkGroupChoice('')
    void refresh()
  }

  async function applyBulkRole() {
    if (!bulkRoleChoice) return
    const ids = Array.from(selected)
    if (bulkRoleChoice === 'user' && currentUserId && ids.includes(currentUserId)) {
      alert('Selection includes your own account — cannot downgrade yourself.')
      return
    }
    await usersApi.bulkUpdate({ userIds: ids, role: bulkRoleChoice as 'admin' | 'user' })
    setSelected(new Set())
    setBulkRoleChoice('')
    void refresh()
  }

  async function deleteSelected() {
    const ids = Array.from(selected).filter((id) => id !== currentUserId)
    if (ids.length === 0) return
    if (!confirm(`Delete ${ids.length} user(s)? This cannot be undone.`)) return
    for (const id of ids) {
      await usersApi.delete(id)
    }
    setSelected(new Set())
    void refresh()
  }

  async function revokeSelectedMcpTokens() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (!confirm(`Revoke all active MCP tokens for ${ids.length} selected user(s)?`)) return
    const results = await Promise.all(ids.map((id) => usersApi.revokeAllMcpTokens(id)))
    const revoked = results.reduce((sum, result) => sum + result.revoked, 0)
    alert(`Revoked ${revoked} MCP token${revoked === 1 ? '' : 's'}.`)
    setSelected(new Set())
    void refresh()
  }

  async function deactivateSelected() {
    const ids = Array.from(selected).filter((id) => id !== currentUserId)
    if (ids.length === 0) return
    if (!confirm(`Deactivate ${ids.length} selected user(s)?`)) return
    await usersApi.bulkUpdate({ userIds: ids, deactivated: true })
    setSelected(new Set())
    void refresh()
  }

  if (loading) {
    return <div className="py-10 text-center text-sm text-neutral-500">Loading users…</div>
  }

  const allChecked = users.length > 0 && selected.size === users.length
  const selectionHasSelf = currentUserId != null && selected.has(currentUserId)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {users.length} user{users.length === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90"
        >
          + Invite user
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => toggleAll(e.target.checked)}
                  aria-label="Select all"
                />
              </th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Group</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">CI tokens</th>
              <th className="w-10 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === currentUserId
              const initials = (u.name?.[0] ?? u.email?.[0] ?? '?').toUpperCase()
              return (
                <tr key={u.id} className="border-t border-neutral-100">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(u.id)}
                      onChange={() => toggleOne(u.id)}
                      aria-label={`Select ${u.name}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {u.image ? (
                        <img
                          src={u.image}
                          alt=""
                          className="h-7 w-7 rounded-full ring-1 ring-neutral-200 object-cover"
                        />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                          {initials}
                        </div>
                      )}
                      <span className="font-medium">
                        {u.name}
                        {isSelf && <span className="ml-2 text-xs text-neutral-400">(you)</span>}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.role === 'admin'
                          ? 'bg-neutral-900 text-white'
                          : 'bg-neutral-100 text-neutral-700'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {u.groupId ? (groupsById.get(u.groupId)?.name ?? '—') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.deactivatedAt
                          ? 'bg-red-100 text-red-700'
                          : u.pendingInvite
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {u.deactivatedAt ? 'Deactivated' : u.pendingInvite ? 'Pending' : 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.ciTokensEnabled
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-neutral-100 text-neutral-700'
                      }`}
                    >
                      {u.ciTokensEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RowMenu
                      user={u}
                      isSelf={isSelf}
                      onEdit={() => setEditUser(u)}
                      onResend={() => resendInvite(u.id)}
                      onReset={() => resetPassword(u)}
                      onRevokeTokens={() => revokeUserMcpTokens(u)}
                      onDeactivate={() => deactivateUser(u)}
                      onReactivate={() => reactivateUser(u)}
                      onDelete={() => deleteUser(u)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="h-4 w-px bg-neutral-200" />
          <label className="flex items-center gap-2 text-sm">
            Assign to group:
            <select
              value={bulkGroupChoice}
              onChange={(e) => setBulkGroupChoice(e.target.value)}
              className="rounded-md border border-neutral-200 bg-background px-2 py-1 text-sm"
            >
              <option value="">—</option>
              <option value="__none__">(No group)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={applyBulkGroup}
              disabled={!bulkGroupChoice}
              className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50"
            >
              Apply
            </button>
          </label>
          <label className="flex items-center gap-2 text-sm">
            Change role:
            <select
              value={bulkRoleChoice}
              onChange={(e) => setBulkRoleChoice(e.target.value)}
              className="rounded-md border border-neutral-200 bg-background px-2 py-1 text-sm"
            >
              <option value="">—</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="button"
              onClick={applyBulkRole}
              disabled={!bulkRoleChoice || (bulkRoleChoice === 'user' && selectionHasSelf)}
              title={
                bulkRoleChoice === 'user' && selectionHasSelf
                  ? 'Selection includes you — cannot downgrade self.'
                  : undefined
              }
              className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50"
            >
              Apply
            </button>
          </label>
          <button
            type="button"
            onClick={deleteSelected}
            disabled={selectionHasSelf && selected.size === 1}
            title={selectionHasSelf ? 'Your own account will be skipped' : undefined}
            className="ml-auto rounded-md border border-red-200 bg-white px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={revokeSelectedMcpTokens}
            className="rounded-md border border-amber-200 bg-white px-3 py-1 text-sm font-medium text-amber-700 hover:bg-amber-50"
          >
            Revoke MCP tokens
          </button>
          <button
            type="button"
            onClick={deactivateSelected}
            disabled={selectionHasSelf && selected.size === 1}
            title={selectionHasSelf ? 'Your own account will be skipped' : undefined}
            className="rounded-md border border-red-200 bg-white px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Deactivate
          </button>
        </div>
      )}

      <UsersInviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        groups={groups}
        onInvited={(url) => {
          setInviteOpen(false)
          setReveal({
            open: true,
            url,
            title: 'Invite link',
            helperText: 'Share this link with the user. It expires in 7 days.',
          })
          void refresh()
        }}
      />

      <UsersEditDialog
        open={editUser !== null}
        onClose={() => setEditUser(null)}
        user={editUser}
        groups={groups}
        currentUserId={currentUserId}
        onSaved={() => void refresh()}
      />

      <UsersUrlRevealDialog
        open={reveal.open}
        onClose={() => setReveal({ ...reveal, open: false, url: null })}
        url={reveal.url}
        title={reveal.title}
        helperText={reveal.helperText}
      />
    </div>
  )
}

function RowMenu({
  user,
  isSelf,
  onEdit,
  onResend,
  onReset,
  onRevokeTokens,
  onDeactivate,
  onReactivate,
  onDelete,
}: {
  user: ManagedUser
  isSelf: boolean
  onEdit: () => void
  onResend: () => void
  onReset: () => void
  onRevokeTokens: () => void
  onDeactivate: () => void
  onReactivate: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  const updateMenuPosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return

    setMenuPosition({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    })
  }, [])

  useEffect(() => {
    if (!open) return

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open, updateMenuPosition])

  function toggleMenu() {
    if (open) {
      setOpen(false)
      return
    }

    updateMenuPosition()
    setOpen(true)
  }

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleMenu}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="rounded-md px-2 py-1 text-neutral-500 hover:bg-neutral-100"
        aria-label={`Actions for ${user.name}`}
      >
        ⋯
      </button>
      {open && menuPosition && (
        <div
          style={{ position: 'fixed', top: menuPosition.top, right: menuPosition.right }}
          className="z-50 w-44 rounded-md border border-neutral-200 bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            onClick={onEdit}
            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
          >
            Edit
          </button>
          {user.pendingInvite ? (
            <button
              type="button"
              onClick={onResend}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
            >
              Resend invite
            </button>
          ) : (
            <button
              type="button"
              onClick={onReset}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
            >
              Reset password
            </button>
          )}
          <button
            type="button"
            onClick={onRevokeTokens}
            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
          >
            Revoke MCP tokens
          </button>
          {user.deactivatedAt ? (
            <button
              type="button"
              onClick={onReactivate}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
            >
              Reactivate
            </button>
          ) : (
            <button
              type="button"
              onClick={onDeactivate}
              disabled={isSelf}
              className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Deactivate
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={isSelf}
            className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
