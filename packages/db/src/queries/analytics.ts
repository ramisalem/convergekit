import { and, asc, desc, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm'
import { db } from '../client.js'
import {
  branches,
  chatMessages,
  chatSessions,
  chunks,
  documents,
  indexingRuns,
  mcpTokenAuditEvents,
  mcpTokens,
  repositories,
  wikiPages,
} from '../schema.js'
import {
  enumerateUtcDays,
  successRate,
  topNWithOther,
  windowStart,
  zeroFillSeries,
  type AnalyticsWindow,
} from './analytics-transforms.js'
import type { HealthResponse, KpiResponse, UtilizationResponse } from '@convergekit/types'

const DAY = sql`'YYYY-MM-DD'`

/** Computes the UTC window bounds once per request. */
function windowBounds(window: AnalyticsWindow) {
  const now = new Date()
  const start = windowStart(window, now)
  const days = enumerateUtcDays(start, now)
  return { start, now, days }
}

export async function getAnalyticsKpis(window: AnalyticsWindow): Promise<KpiResponse> {
  const { start, days } = windowBounds(window)

  // Repositories by status (exclude soft-deleted).
  const repoRows = await db
    .select({ status: repositories.status, count: sql<number>`count(*)::int` })
    .from(repositories)
    .where(isNull(repositories.deletedAt))
    .groupBy(repositories.status)
  const repoByStatus = { done: 0, processing: 0, failed: 0, pending: 0 }
  for (const r of repoRows)
    if (r.status in repoByStatus) repoByStatus[r.status as keyof typeof repoByStatus] = r.count
  const repoTotal = repoRows.reduce((sum, r) => sum + r.count, 0)

  // MCP calls per day by status.
  const mcpRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${mcpTokenAuditEvents.createdAt} at time zone 'UTC'), ${DAY})`,
      status: mcpTokenAuditEvents.status,
      count: sql<number>`count(*)::int`,
    })
    .from(mcpTokenAuditEvents)
    .where(gte(mcpTokenAuditEvents.createdAt, start))
    .groupBy(sql`1`, mcpTokenAuditEvents.status)
  const mcpTotals = { success: 0, failure: 0, rate_limited: 0 }
  const mcpDailyMap = new Map<string, number>()
  for (const r of mcpRows) {
    if (r.status in mcpTotals) mcpTotals[r.status as keyof typeof mcpTotals] += r.count
    mcpDailyMap.set(r.day, (mcpDailyMap.get(r.day) ?? 0) + r.count)
  }
  const mcpDaily = zeroFillSeries(
    days,
    [...mcpDailyMap.entries()].map(([day, count]) => ({ day, count })),
    ['count'],
  )

  // Chat sessions per day.
  const chatRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${chatSessions.createdAt} at time zone 'UTC'), ${DAY})`,
      count: sql<number>`count(*)::int`,
    })
    .from(chatSessions)
    .where(gte(chatSessions.createdAt, start))
    .groupBy(sql`1`)
  const chatDaily = zeroFillSeries(days, chatRows, ['count'])

  // Active users per day (distinct from MCP audit) + window union with chat users.
  const mcpUserRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${mcpTokenAuditEvents.createdAt} at time zone 'UTC'), ${DAY})`,
      count: sql<number>`count(distinct ${mcpTokenAuditEvents.userId})::int`,
    })
    .from(mcpTokenAuditEvents)
    .where(gte(mcpTokenAuditEvents.createdAt, start))
    .groupBy(sql`1`)
  const activeDaily = zeroFillSeries(days, mcpUserRows, ['count'])

  // Distinct active users across both surfaces, counted in a single query. Pass
  // the window bound as an ISO string + cast — interpolating a JS Date into a
  // sql`` template fails in postgres-js.
  const startIso = start.toISOString()
  const activeRows = (await db.execute(sql`
    select count(distinct user_id)::int as count from (
      select user_id from mcp_token_audit_events
        where created_at >= ${startIso}::timestamptz and user_id is not null
      union
      select user_id from chat_sessions
        where created_at >= ${startIso}::timestamptz and user_id is not null
    ) u
  `)) as unknown as Array<{ count: number }>
  const activeTotal = Number(activeRows[0]?.count ?? 0)

  return {
    repositories: { total: repoTotal, ...repoByStatus },
    mcpCalls: {
      total: mcpTotals.success + mcpTotals.failure + mcpTotals.rate_limited,
      successRate: successRate(mcpTotals),
      daily: mcpDaily,
    },
    chatSessions: { total: chatDaily.reduce((s, d) => s + d.count, 0), daily: chatDaily },
    activeUsers: { total: activeTotal, daily: activeDaily },
  }
}

export async function getAnalyticsHealth(window: AnalyticsWindow): Promise<HealthResponse> {
  const { start, days } = windowBounds(window)

  // 1. MCP traffic per day by status (zero-filled, split columns).
  const trafficRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${mcpTokenAuditEvents.createdAt} at time zone 'UTC'), ${DAY})`,
      status: mcpTokenAuditEvents.status,
      count: sql<number>`count(*)::int`,
    })
    .from(mcpTokenAuditEvents)
    .where(gte(mcpTokenAuditEvents.createdAt, start))
    .groupBy(sql`1`, mcpTokenAuditEvents.status)
  const trafficByDay = new Map<string, { success: number; failure: number; rate_limited: number }>()
  for (const r of trafficRows) {
    const entry = trafficByDay.get(r.day) ?? { success: 0, failure: 0, rate_limited: 0 }
    if (r.status in entry) entry[r.status as keyof typeof entry] = r.count
    trafficByDay.set(r.day, entry)
  }
  const mcpTraffic = zeroFillSeries(
    days,
    [...trafficByDay.entries()].map(([day, v]) => ({ day, ...v })),
    ['success', 'failure', 'rate_limited'],
  )

  // 2. Failure breakdown by errorCode x toolName.
  const failureRowsRaw = await db
    .select({
      errorCode: mcpTokenAuditEvents.errorCode,
      toolName: mcpTokenAuditEvents.toolName,
      count: sql<number>`count(*)::int`,
    })
    .from(mcpTokenAuditEvents)
    .where(and(gte(mcpTokenAuditEvents.createdAt, start), sql`${mcpTokenAuditEvents.status} <> 'success'`))
    .groupBy(mcpTokenAuditEvents.errorCode, mcpTokenAuditEvents.toolName)
    .orderBy(desc(sql`count(*)`))
    .limit(25)
  const failureTotal = failureRowsRaw.reduce((s, r) => s + r.count, 0)
  const failures = failureRowsRaw.map((r) => ({
    errorCode: r.errorCode,
    toolName: r.toolName,
    count: r.count,
    pct: failureTotal === 0 ? 0 : r.count / failureTotal,
  }))

  // 3. Latency percentiles per tool (tool calls only).
  const latency = await db
    .select({
      toolName: sql<string>`${mcpTokenAuditEvents.toolName}`,
      p50: sql<number>`percentile_cont(0.5) within group (order by ${mcpTokenAuditEvents.latencyMs})::int`,
      p95: sql<number>`percentile_cont(0.95) within group (order by ${mcpTokenAuditEvents.latencyMs})::int`,
      p99: sql<number>`percentile_cont(0.99) within group (order by ${mcpTokenAuditEvents.latencyMs})::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(mcpTokenAuditEvents)
    .where(and(gte(mcpTokenAuditEvents.createdAt, start), isNotNull(mcpTokenAuditEvents.toolName)))
    .groupBy(mcpTokenAuditEvents.toolName)
    .orderBy(desc(sql`count(*)`))
    .limit(15)

  // 4. Indexing run health (within window).
  const indexingByStatus = await db
    .select({ status: indexingRuns.status, count: sql<number>`count(*)::int` })
    .from(indexingRuns)
    .where(gte(indexingRuns.createdAt, start))
    .groupBy(indexingRuns.status)
  const [avgDurationRow] = await db
    .select({
      avg: sql<number | null>`avg(extract(epoch from (${indexingRuns.finishedAt} - ${indexingRuns.startedAt})))`,
    })
    .from(indexingRuns)
    .where(and(gte(indexingRuns.createdAt, start), isNotNull(indexingRuns.finishedAt), isNotNull(indexingRuns.startedAt)))
  const recentFailures = await db
    .select({
      repositoryName: repositories.name,
      failureReason: indexingRuns.failureReason,
      finishedAt: indexingRuns.finishedAt,
    })
    .from(indexingRuns)
    .leftJoin(repositories, eq(repositories.id, indexingRuns.repositoryId))
    .where(and(gte(indexingRuns.createdAt, start), eq(indexingRuns.status, 'failed')))
    .orderBy(desc(indexingRuns.createdAt))
    .limit(10)

  // 5. Stale branches + stuck repos (snapshot).
  const staleBranches = await db
    .select({
      repositoryName: repositories.name,
      branchName: branches.name,
      lastIndexedAt: branches.lastIndexedAt,
    })
    .from(branches)
    .leftJoin(repositories, eq(repositories.id, branches.repositoryId))
    .where(and(isNotNull(branches.lastIndexedAt), isNull(repositories.deletedAt)))
    .orderBy(asc(branches.lastIndexedAt))
    .limit(10)
  const stuckRepos = await db
    .select({ name: repositories.name, status: repositories.status })
    .from(repositories)
    .where(and(isNull(repositories.deletedAt), sql`${repositories.status} in ('processing','failed')`))
    .limit(25)

  // 6. MCP token health (snapshot). Do the 7-day window in SQL — interpolating a
  // JS Date into a sql`` template fails in postgres-js (it expects a string param).
  const [tokenCounts] = await db
    .select({
      active: sql<number>`count(*) filter (where ${mcpTokens.revokedAt} is null and ${mcpTokens.expiresAt} > now())::int`,
      revoked: sql<number>`count(*) filter (where ${mcpTokens.revokedAt} is not null)::int`,
      expired: sql<number>`count(*) filter (where ${mcpTokens.revokedAt} is null and ${mcpTokens.expiresAt} <= now())::int`,
      nearingExpiry: sql<number>`count(*) filter (where ${mcpTokens.revokedAt} is null and ${mcpTokens.expiresAt} > now() and ${mcpTokens.expiresAt} <= now() + interval '7 days')::int`,
    })
    .from(mcpTokens)

  return {
    mcpTraffic,
    failures,
    latency,
    indexing: {
      byStatus: indexingByStatus,
      avgDurationSec: avgDurationRow?.avg ?? null,
      recentFailures: recentFailures.map((r) => ({
        repositoryName: r.repositoryName,
        failureReason: r.failureReason,
        finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
      })),
    },
    staleBranches: staleBranches.map((r) => ({
      repositoryName: r.repositoryName,
      branchName: r.branchName,
      lastIndexedAt: r.lastIndexedAt ? r.lastIndexedAt.toISOString() : null,
    })),
    stuckRepos,
    tokens: tokenCounts ?? { active: 0, revoked: 0, expired: 0, nearingExpiry: 0 },
  }
}

export async function getAnalyticsUtilization(window: AnalyticsWindow): Promise<UtilizationResponse> {
  const { start, days } = windowBounds(window)

  // Top tools (with Other bucket).
  const toolRows = await db
    .select({ label: sql<string>`coalesce(${mcpTokenAuditEvents.toolName}, '(non-tool)')`, count: sql<number>`count(*)::int` })
    .from(mcpTokenAuditEvents)
    .where(and(gte(mcpTokenAuditEvents.createdAt, start), isNotNull(mcpTokenAuditEvents.toolName)))
    .groupBy(mcpTokenAuditEvents.toolName)
  const topTools = topNWithOther(toolRows, 10)

  // Top clients (with Other bucket) + principal split.
  const clientRows = await db
    .select({ label: sql<string>`coalesce(${mcpTokenAuditEvents.clientName}, '(unknown)')`, count: sql<number>`count(*)::int` })
    .from(mcpTokenAuditEvents)
    .where(gte(mcpTokenAuditEvents.createdAt, start))
    .groupBy(mcpTokenAuditEvents.clientName)
  const topClients = topNWithOther(clientRows, 10)
  const principalRows = await db
    .select({ kind: mcpTokenAuditEvents.principalKind, count: sql<number>`count(*)::int` })
    .from(mcpTokenAuditEvents)
    .where(gte(mcpTokenAuditEvents.createdAt, start))
    .groupBy(mcpTokenAuditEvents.principalKind)
  const principalSplit = { static: 0, oauth: 0 }
  for (const r of principalRows)
    if (r.kind in principalSplit) principalSplit[r.kind as keyof typeof principalSplit] = r.count

  // Top repositories by MCP activity.
  const topRepositories = await db
    .select({
      repositoryName: repositories.name,
      calls: sql<number>`count(*)::int`,
      distinctClients: sql<number>`count(distinct ${mcpTokenAuditEvents.clientName})::int`,
      lastUsed: sql<string>`max(${mcpTokenAuditEvents.createdAt})`,
    })
    .from(mcpTokenAuditEvents)
    .leftJoin(repositories, eq(repositories.id, mcpTokenAuditEvents.repositoryId))
    .where(and(gte(mcpTokenAuditEvents.createdAt, start), isNotNull(mcpTokenAuditEvents.repositoryId)))
    .groupBy(repositories.name)
    .orderBy(desc(sql`count(*)`))
    .limit(10)

  // Repository onboarding per day.
  const onboardingRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${repositories.createdAt} at time zone 'UTC'), ${DAY})`,
      count: sql<number>`count(*)::int`,
    })
    .from(repositories)
    .where(and(gte(repositories.createdAt, start), isNull(repositories.deletedAt)))
    .groupBy(sql`1`)
  const onboarding = zeroFillSeries(days, onboardingRows, ['count'])

  // MCP vs chat message volume per day.
  const mcpVolRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${mcpTokenAuditEvents.createdAt} at time zone 'UTC'), ${DAY})`,
      mcp: sql<number>`count(*)::int`,
    })
    .from(mcpTokenAuditEvents)
    .where(gte(mcpTokenAuditEvents.createdAt, start))
    .groupBy(sql`1`)
  const chatVolRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${chatMessages.createdAt} at time zone 'UTC'), ${DAY})`,
      chat: sql<number>`count(*)::int`,
    })
    .from(chatMessages)
    .where(gte(chatMessages.createdAt, start))
    .groupBy(sql`1`)
  const volByDay = new Map<string, { mcp: number; chat: number }>()
  for (const r of mcpVolRows) volByDay.set(r.day, { mcp: r.mcp, chat: volByDay.get(r.day)?.chat ?? 0 })
  for (const r of chatVolRows) volByDay.set(r.day, { mcp: volByDay.get(r.day)?.mcp ?? 0, chat: r.chat })
  const mcpVsChat = zeroFillSeries(
    days,
    [...volByDay.entries()].map(([day, v]) => ({ day, ...v })),
    ['mcp', 'chat'],
  )

  // Corpus footprint (snapshot).
  const [{ count: repoCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(repositories)
    .where(isNull(repositories.deletedAt))
  const [{ count: branchCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(branches)
  const [{ count: docCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(documents)
  const [{ count: chunkCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(chunks)
  const wikiRows = await db
    .select({ status: wikiPages.status, count: sql<number>`count(*)::int` })
    .from(wikiPages)
    .groupBy(wikiPages.status)
  const wikiByStatus = { done: 0, generating: 0, pending: 0, failed: 0 }
  for (const r of wikiRows)
    if (r.status in wikiByStatus) wikiByStatus[r.status as keyof typeof wikiByStatus] = r.count

  return {
    topTools,
    topClients,
    principalSplit,
    topRepositories: topRepositories.map((r) => ({
      repositoryName: r.repositoryName,
      calls: r.calls,
      distinctClients: r.distinctClients,
      lastUsed: r.lastUsed ? new Date(r.lastUsed).toISOString() : null,
    })),
    onboarding,
    mcpVsChat,
    corpus: {
      repositories: repoCount,
      branches: branchCount,
      documents: docCount,
      chunks: chunkCount,
      wikiPages: wikiByStatus,
    },
  }
}
