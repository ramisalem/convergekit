'use client'

import type { UtilizationResponse } from '@convergekit/types'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarList, Card, SimpleTable } from './dashboard-primitives'

function fmtDate(iso: string | null) {
  return iso ? iso.slice(0, 10) : '—'
}

export function UtilizationSection({ data }: { data: UtilizationResponse }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Top tools">
        <BarList items={data.topTools} />
      </Card>

      <Card title="Top clients / IDEs">
        <BarList items={data.topClients} />
        <p className="mt-3 text-xs text-neutral-500">
          Principal: {data.principalSplit.static.toLocaleString()} static ·{' '}
          {data.principalSplit.oauth.toLocaleString()} oauth
        </p>
      </Card>

      <div className="lg:col-span-2">
        <Card title="MCP vs chat volume">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.mcpVsChat} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="mcp" stroke="hsl(var(--foreground))" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                <Line type="monotone" dataKey="chat" stroke="#7c3aed" dot={false} strokeWidth={1.5} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Top repositories by activity">
        <SimpleTable
          rows={data.topRepositories}
          empty="No MCP activity in this window."
          columns={[
            { header: 'Repository', cell: (r) => r.repositoryName ?? '—' },
            { header: 'Calls', align: 'right', cell: (r) => r.calls.toLocaleString() },
            { header: 'Clients', align: 'right', cell: (r) => r.distinctClients.toLocaleString() },
            { header: 'Last used', align: 'right', cell: (r) => fmtDate(r.lastUsed) },
          ]}
        />
      </Card>

      <Card title="Repository onboarding">
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.onboarding} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="hsl(var(--foreground))" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="lg:col-span-2">
        <Card title="Corpus footprint">
          <div className="flex flex-wrap gap-6 text-sm">
            <div><span className="font-medium tabular-nums">{data.corpus.repositories.toLocaleString()}</span> <span className="text-neutral-500">repositories</span></div>
            <div><span className="font-medium tabular-nums">{data.corpus.branches.toLocaleString()}</span> <span className="text-neutral-500">branches</span></div>
            <div><span className="font-medium tabular-nums">{data.corpus.documents.toLocaleString()}</span> <span className="text-neutral-500">documents</span></div>
            <div><span className="font-medium tabular-nums">{data.corpus.chunks.toLocaleString()}</span> <span className="text-neutral-500">chunks</span></div>
            <div className="text-neutral-500">
              wiki: {data.corpus.wikiPages.done} done · {data.corpus.wikiPages.generating} generating ·{' '}
              {data.corpus.wikiPages.pending} pending · {data.corpus.wikiPages.failed} failed
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
