'use client'

import type { HealthResponse } from '@convergekit/types'
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, SimpleTable } from './dashboard-primitives'

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}

function fmtDate(iso: string | null) {
  return iso ? iso.slice(0, 10) : '—'
}

export function HealthSection({ data }: { data: HealthResponse }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <Card title="MCP traffic & success">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.mcpTraffic} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="success" stackId="1" stroke="#16a34a" fill="#16a34a" fillOpacity={0.3} isAnimationActive={false} />
                <Area type="monotone" dataKey="failure" stackId="1" stroke="#dc2626" fill="#dc2626" fillOpacity={0.3} isAnimationActive={false} />
                <Area type="monotone" dataKey="rate_limited" stackId="1" stroke="#d97706" fill="#d97706" fillOpacity={0.3} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Failure breakdown">
        <SimpleTable
          rows={data.failures}
          empty="No failures in this window."
          columns={[
            { header: 'Error code', cell: (r) => r.errorCode ?? '—' },
            { header: 'Tool', cell: (r) => r.toolName ?? '—' },
            { header: 'Count', align: 'right', cell: (r) => r.count.toLocaleString() },
            { header: '% of fails', align: 'right', cell: (r) => fmtPct(r.pct) },
          ]}
        />
      </Card>

      <Card title="Latency by tool (ms)">
        <SimpleTable
          rows={data.latency}
          empty="No tool calls in this window."
          columns={[
            { header: 'Tool', cell: (r) => r.toolName },
            { header: 'p50', align: 'right', cell: (r) => r.p50.toLocaleString() },
            { header: 'p95', align: 'right', cell: (r) => r.p95.toLocaleString() },
            { header: 'p99', align: 'right', cell: (r) => r.p99.toLocaleString() },
            { header: 'Calls', align: 'right', cell: (r) => r.count.toLocaleString() },
          ]}
        />
      </Card>

      <Card title="Indexing runs">
        <div className="mb-3 flex flex-wrap gap-4">
          {data.indexing.byStatus.map((s) => (
            <div key={s.status} className="text-sm">
              <span className="font-medium">{s.count}</span>{' '}
              <span className="text-neutral-500">{s.status}</span>
            </div>
          ))}
          <div className="text-sm">
            <span className="font-medium">
              {data.indexing.avgDurationSec == null ? '—' : `${Math.round(data.indexing.avgDurationSec)}s`}
            </span>{' '}
            <span className="text-neutral-500">avg duration</span>
          </div>
        </div>
        <SimpleTable
          rows={data.indexing.recentFailures}
          empty="No recent indexing failures."
          columns={[
            { header: 'Repository', cell: (r) => r.repositoryName ?? '—' },
            { header: 'Reason', cell: (r) => r.failureReason ?? '—' },
            { header: 'When', align: 'right', cell: (r) => fmtDate(r.finishedAt) },
          ]}
        />
      </Card>

      <Card title="Stale & stuck repos">
        <SimpleTable
          rows={data.staleBranches}
          empty="Nothing stale."
          columns={[
            { header: 'Repository', cell: (r) => r.repositoryName ?? '—' },
            { header: 'Branch', cell: (r) => r.branchName },
            { header: 'Last indexed', align: 'right', cell: (r) => fmtDate(r.lastIndexedAt) },
          ]}
        />
        {data.stuckRepos.length > 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            Stuck: {data.stuckRepos.map((r) => `${r.name} (${r.status})`).join(', ')}
          </p>
        ) : null}
      </Card>

      <Card title="MCP token health">
        <div className="flex flex-wrap gap-6">
          <div className="text-sm"><span className="font-medium">{data.tokens.active}</span> <span className="text-neutral-500">active</span></div>
          <div className="text-sm"><span className="font-medium">{data.tokens.revoked}</span> <span className="text-neutral-500">revoked</span></div>
          <div className="text-sm"><span className="font-medium">{data.tokens.expired}</span> <span className="text-neutral-500">expired</span></div>
          <div className="text-sm"><span className="font-medium">{data.tokens.nearingExpiry}</span> <span className="text-neutral-500">expiring ≤7d</span></div>
        </div>
      </Card>
    </div>
  )
}
