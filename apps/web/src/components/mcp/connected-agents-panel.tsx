'use client'

import { connectedAgentsApi, type ConnectedAgent } from '@/lib/api-client'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

export function ConnectedAgentsPanel() {
  const t = useTranslations('connectedAgents')
  const [agents, setAgents] = useState<ConnectedAgent[] | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  function load() {
    connectedAgentsApi
      .list()
      .then((r) => setAgents(r.agents))
      .catch(() => setAgents([]))
  }
  useEffect(load, [])

  async function revoke(clientId: string) {
    setRevoking(clientId)
    try {
      await connectedAgentsApi.revoke(clientId)
      load()
    } finally {
      setRevoking(null)
    }
  }

  return (
    <section>
      <h1 className="text-lg font-semibold text-[var(--convergekit-ink)]">{t('title')}</h1>
      <p className="mt-1 text-sm text-[var(--convergekit-ink-3)]">{t('subtitle')}</p>
      <div className="mt-6 divide-y divide-[var(--convergekit-line)] rounded-md border border-[var(--convergekit-line)]">
        {agents && agents.length === 0 && (
          <p className="p-4 text-sm text-[var(--convergekit-ink-3)]">{t('empty')}</p>
        )}
        {agents?.map((a) => (
          <div key={a.clientId} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-[var(--convergekit-ink)]">{a.clientName}</p>
              <p className="text-xs text-[var(--convergekit-ink-3)]">
                {t('created')}: {new Date(a.createdAt).toLocaleString()} · {t('lastUsed')}:{' '}
                {a.lastUsedAt ? new Date(a.lastUsedAt).toLocaleString() : t('never')}
              </p>
            </div>
            <button
              type="button"
              disabled={revoking === a.clientId}
              onClick={() => revoke(a.clientId)}
              className="h-8 rounded-md border border-[var(--convergekit-line)] px-3 text-sm font-medium text-red-600 disabled:opacity-50"
            >
              {revoking === a.clientId ? t('revoking') : t('revoke')}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
