'use client'

import type { DailyPoint, KpiResponse } from '@convergekit/types'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { Card, StatTile } from './dashboard-primitives'

function Sparkline({ data }: { data: DailyPoint[] }) {
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <Area
            type="monotone"
            dataKey="count"
            stroke="hsl(var(--foreground))"
            fill="hsl(var(--foreground))"
            fillOpacity={0.12}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function KpiStrip({ data }: { data: KpiResponse }) {
  const successPct =
    data.mcpCalls.successRate == null ? '—' : `${(data.mcpCalls.successRate * 100).toFixed(1)}%`
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card title="Repositories">
        <StatTile
          label="Total"
          value={data.repositories.total.toLocaleString()}
          hint={`${data.repositories.done} done · ${data.repositories.processing} processing · ${data.repositories.failed} failed · ${data.repositories.pending} pending`}
        />
      </Card>
      <Card title="MCP calls">
        <StatTile
          label="In window"
          value={data.mcpCalls.total.toLocaleString()}
          hint={`${successPct} success`}
        />
        <Sparkline data={data.mcpCalls.daily} />
      </Card>
      <Card title="Chat sessions">
        <StatTile label="In window" value={data.chatSessions.total.toLocaleString()} />
        <Sparkline data={data.chatSessions.daily} />
      </Card>
      <Card title="Active users">
        <StatTile label="In window" value={data.activeUsers.total.toLocaleString()} />
        <Sparkline data={data.activeUsers.daily} />
      </Card>
    </div>
  )
}
