'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

type Client = 'claudeCode' | 'claudeDesktop' | 'cursor' | 'generic'

export function ConnectInstructions() {
  const t = useTranslations('connectInstructions')
  const [client, setClient] = useState<Client>('claudeCode')
  // Derive the MCP server URL from the origin the user is actually on (the API is
  // same-origin via the proxy), so it's correct for local/staging/prod alike — not a
  // hardcoded production host. Seed from the build-time env to keep SSR/first-render
  // stable, then correct to the live origin after mount.
  const [origin, setOrigin] = useState(process.env.NEXT_PUBLIC_WEB_URL ?? '')
  useEffect(() => setOrigin(window.location.origin), [])
  const endpoint = `${origin}/api/mcp`
  const SNIPPETS: Record<Client, string> = {
    claudeCode: `claude mcp add --transport http colab-ai-hub ${endpoint}`,
    claudeDesktop: endpoint,
    cursor: JSON.stringify({ mcpServers: { 'colab-ai-hub': { url: endpoint } } }, null, 2),
    generic: endpoint,
  }
  const tabs: Client[] = ['claudeCode', 'claudeDesktop', 'cursor', 'generic']

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-[var(--convergekit-ink)]">{t('title')}</h2>
      <p className="mt-1 text-sm text-[var(--convergekit-ink-3)]">{t('subtitle')}</p>
      <div className="mt-4 flex gap-2">
        {tabs.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setClient(c)}
            className={`h-8 rounded-md px-3 text-sm font-medium ${
              client === c
                ? 'bg-[var(--convergekit-ink)] text-white'
                : 'border border-[var(--convergekit-line)] text-[var(--convergekit-ink-2)]'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-[var(--convergekit-ink-2)]">{t(client)}</p>
      <pre className="mt-2 overflow-x-auto rounded-md border border-[var(--convergekit-line)] bg-[var(--convergekit-bg-3)] p-3 text-xs">
        <code>{SNIPPETS[client]}</code>
      </pre>
    </section>
  )
}
