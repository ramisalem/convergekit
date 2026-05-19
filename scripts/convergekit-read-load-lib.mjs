export const SCENARIOS = ['chat', 'mcpSearch', 'mcpRead', 'mcpStructure']

const DEFAULT_WEIGHTS = {
  chat: 70,
  mcpSearch: 20,
  mcpRead: 5,
  mcpStructure: 5,
}

const DEFAULT_OPTIONS = {
  durationSeconds: 60,
  iterations: 0,
  concurrency: 5,
  rampSeconds: 0,
  timeoutMs: 120_000,
  progressSeconds: 5,
  minThinkMs: 0,
  maxThinkMs: 0,
  mcpSearchLimit: 5,
}

function parseArgv(argv) {
  const values = {}

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${arg}`)
    }

    const withoutPrefix = arg.slice(2)
    const eqIndex = withoutPrefix.indexOf('=')
    if (eqIndex !== -1) {
      values[withoutPrefix.slice(0, eqIndex)] = withoutPrefix.slice(eqIndex + 1)
      continue
    }

    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      values[withoutPrefix] = 'true'
      continue
    }

    values[withoutPrefix] = next
    i++
  }

  return values
}

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
  return parsed
}

function parseWeight(value, fallback, name) {
  const parsed = parsePositiveInteger(value, fallback, name)
  if (parsed > 10_000) throw new Error(`${name} is unreasonably large`)
  return parsed
}

export function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '')
}

export function buildApiUrl(baseUrl, path) {
  const normalizedBase = normalizeBaseUrl(baseUrl)
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (normalizedBase.endsWith('/api') && normalizedPath.startsWith('/api/')) {
    return `${normalizedBase}${normalizedPath.slice('/api'.length)}`
  }

  return `${normalizedBase}${normalizedPath}`
}

export function parseLoadOptions(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgv(argv)
  const baseUrl = args['base-url'] ?? env.CONVERGEKIT_BASE_URL
  const repositoryId = args['repository-id'] ?? env.CONVERGEKIT_REPOSITORY_ID
  const cookie = args.cookie ?? env.CONVERGEKIT_SESSION_COOKIE ?? null
  const mcpToken = args['mcp-token'] ?? env.CONVERGEKIT_MCP_TOKEN ?? null

  if (!baseUrl) throw new Error('Provide --base-url or CONVERGEKIT_BASE_URL')
  if (!repositoryId) throw new Error('Provide --repository-id or CONVERGEKIT_REPOSITORY_ID')

  const weights = {
    chat: parseWeight(args['chat-weight'], DEFAULT_WEIGHTS.chat, '--chat-weight'),
    mcpSearch: parseWeight(
      args['mcp-search-weight'],
      DEFAULT_WEIGHTS.mcpSearch,
      '--mcp-search-weight',
    ),
    mcpRead: parseWeight(args['mcp-read-weight'], DEFAULT_WEIGHTS.mcpRead, '--mcp-read-weight'),
    mcpStructure: parseWeight(
      args['mcp-structure-weight'],
      DEFAULT_WEIGHTS.mcpStructure,
      '--mcp-structure-weight',
    ),
  }

  if (!cookie) weights.chat = 0
  if (!mcpToken) {
    weights.mcpSearch = 0
    weights.mcpRead = 0
    weights.mcpStructure = 0
  }

  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0)
  if (totalWeight === 0) {
    throw new Error('Provide --cookie for chat load or --mcp-token for MCP load')
  }

  const minThinkMs = parsePositiveInteger(
    args['min-think-ms'],
    DEFAULT_OPTIONS.minThinkMs,
    '--min-think-ms',
  )
  const maxThinkMs = parsePositiveInteger(
    args['max-think-ms'],
    args['think-ms'] ?? DEFAULT_OPTIONS.maxThinkMs,
    '--max-think-ms',
  )
  if (maxThinkMs < minThinkMs) {
    throw new Error('--max-think-ms must be greater than or equal to --min-think-ms')
  }

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    repositoryId,
    cookie,
    mcpToken,
    durationSeconds: parsePositiveInteger(
      args['duration-seconds'],
      DEFAULT_OPTIONS.durationSeconds,
      '--duration-seconds',
    ),
    iterations: parsePositiveInteger(args.iterations, DEFAULT_OPTIONS.iterations, '--iterations'),
    concurrency: parsePositiveInteger(args.concurrency, DEFAULT_OPTIONS.concurrency, '--concurrency'),
    rampSeconds: parsePositiveInteger(
      args['ramp-seconds'],
      DEFAULT_OPTIONS.rampSeconds,
      '--ramp-seconds',
    ),
    timeoutMs: parsePositiveInteger(args['timeout-ms'], DEFAULT_OPTIONS.timeoutMs, '--timeout-ms'),
    progressSeconds: parsePositiveInteger(
      args['progress-seconds'],
      DEFAULT_OPTIONS.progressSeconds,
      '--progress-seconds',
    ),
    minThinkMs,
    maxThinkMs,
    mcpSearchLimit: parsePositiveInteger(
      args['mcp-search-limit'],
      DEFAULT_OPTIONS.mcpSearchLimit,
      '--mcp-search-limit',
    ),
    questionsFile: args['questions-file'] ?? null,
    pathsFile: args['paths-file'] ?? null,
    summaryFile: args['summary-file'] ?? null,
    jsonLines: args['json-lines'] === 'true',
    weights,
  }
}

export function createWeightedScenarioPicker(weights) {
  const entries = SCENARIOS.map((scenario) => [scenario, weights[scenario] ?? 0]).filter(
    ([, weight]) => weight > 0,
  )
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  if (total <= 0) throw new Error('At least one scenario weight must be positive')

  return (random = Math.random) => {
    const threshold = Math.min(random() * total, total - Number.EPSILON)
    let cumulative = 0
    for (const [scenario, weight] of entries) {
      cumulative += weight
      if (threshold < cumulative) return scenario
    }
    return entries.at(-1)[0]
  }
}

export function percentile(values, pct) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  if (pct <= 0) return sorted[0]
  if (pct >= 100) return sorted.at(-1)
  const index = Math.ceil((pct / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))]
}

function incrementStatusCode(summary, statusCode) {
  const key = String(statusCode ?? 'unknown')
  summary.statusCodes[key] = (summary.statusCodes[key] ?? 0) + 1
}

function summarizeGroup(results) {
  const latencies = results.map((result) => result.latencyMs)
  const firstChunks = results
    .map((result) => result.firstChunkMs)
    .filter((value) => typeof value === 'number')
  const ok = results.filter((result) => result.ok).length
  const summary = {
    count: results.length,
    ok,
    errors: results.length - ok,
    errorRate: results.length === 0 ? 0 : Number(((results.length - ok) / results.length).toFixed(4)),
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    p99Ms: percentile(latencies, 99),
    minMs: latencies.length ? Math.min(...latencies) : null,
    maxMs: latencies.length ? Math.max(...latencies) : null,
    firstChunkP95Ms: percentile(firstChunks, 95),
    statusCodes: {},
  }

  for (const result of results) {
    incrementStatusCode(summary, result.statusCode)
  }

  return summary
}

export function summarizeResults(results) {
  const scenarios = {}
  for (const scenario of SCENARIOS) {
    const scenarioResults = results.filter((result) => result.scenario === scenario)
    if (scenarioResults.length > 0) {
      scenarios[scenario] = summarizeGroup(scenarioResults)
    }
  }

  return {
    total: summarizeGroup(results),
    scenarios,
  }
}
