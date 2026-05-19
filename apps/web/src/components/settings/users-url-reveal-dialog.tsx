'use client'

import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'

export function UsersUrlRevealDialog({
  open,
  onClose,
  url,
  title,
  helperText,
}: {
  open: boolean
  onClose: () => void
  url: string | null
  title: string
  helperText: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onClose={onClose} title={title} widthClass="max-w-lg">
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">{helperText}</p>
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs break-all">
          {url ?? '—'}
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={copy}
            disabled={!url}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90"
          >
            Done
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          This link is shown once. If you lose it, use Resend invite or Reset password to issue a
          new one.
        </p>
      </div>
    </Dialog>
  )
}
