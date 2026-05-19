#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

import {
  buildApiUrl,
  createWeightedScenarioPicker,
  parseLoadOptions,
  summarizeResults,
} from './convergekit-read-load-lib.mjs'

const DEFAULT_QUESTIONS = [
  'How does authentication work in this repository?',
  'Where is repository access enforced?',
  'Explain the chat request flow and the main files involved.',
  'How does semantic search retrieve code context?',
  'What are the main background jobs and when do they run?',
  'Where are MCP tokens validated and audited?',
  'What database tables are used for documents and chunks?',
  'How are generated wiki pages created from indexed code?',
  'What happens when a user asks a troubleshooting question?',
  'Where are rate limits implemented?',
]

const DEFAULT_PATHS = [
  'README.md',
  'apps/api/src/routes/chat.ts',
  'apps/api/src/routes/mcp.ts',
  'apps/api/src/lib/agent-tools.ts',
  'apps/api/src/lib/rate-limit.ts',
  'packages/db/src/search.ts',
  'packages/db/src/schema.ts',
  'packages/mcp/src/server.ts',
  'packages/queues/src/index.ts',
  'apps/worker/src/workers/repository.ts',
]

function usage() {
  return `ConvergeKit read-path load harness

Usage:
  node scripts/convergekit-read-load.mjs --base-url https://convergekit.example.com --repository-id <uuid> [options]

Auth:
  --cookie <cookie>              Browser session cookie for /api/chat traffic
  --mcp-token <token>            Repository-scoped MCP bearer token

Load shape:
  --duration-seconds <n>         Runtime when --iterations is not set (default: 60)
  --iterations <n>               Total operations across all workers (default: 0, duration mode)
  --concurrency <n>              Virtual workers (default: 5)
  --ramp-seconds <n>             Spread worker startup over this many seconds (default: 0)
  --timeout-ms <n>               Per-operation timeout (default: 120000)
  --min-think-ms <n>             Minimum delay between worker operations (default: 0)
  --max-think-ms <n>             Maximum delay between worker operations (default: 0)

Scenario weights:
  --chat-weight <n>              Browser chat weight (default: 70, requires --cookie)
  --mcp-search-weight <n>        MCP search_docs weight (default: 20, requires --mcp-token)
  --mcp-read-weight <n>          MCP read_file weight (default: 5, requires --mcp-token)
  --mcp-structure-weight <n>     MCP get_structure weight (default: 5, requires --mcp-token)

Inputs:
  --questions-file <path>        One question per line; blank lines and # comments ignored
  --paths-file <path>            One repository path per line for read_file
  --mcp-search-limit <n>         search_docs limit (default: 5)

Output:
  --progress-seconds <n>         Progress summary interval on stderr (default: 5)
  --json-lines                  Emit each operation and final summary as JSON lines on stdout
  --summary-file <path>          Write final summary JSON to a file

Environment aliases:
  CONVERGEKIT_BASE_URL, CONVERGEKIT_REPOSITORY_ID, CONVERGEKIT_SESSION_COOKIE, CONVERGEKIT_MCP_TOKEN

Examples:
  CONVERGEKIT_SESSION_COOKIE='better-auth.session_token=...' \\
    node scripts/convergekit-read-load.mjs --base-url https://convergekit.example.com --repository-id <uuid> --concurrency 20 --duration-seconds 600

  CONVERGEKIT_MCP_TOKEN='cwk_...' \\
    node scripts/convergekit-read-load.mjs --base-url https://convergekit.example.com --repository-id <uuid> --concurrency 30 --chat-weight 0 --mcp-search-weight 80 --mcp-read-weight 10 --mcp-structure-weight 10
`
}

function nowIso() {
  return new Date().toISOString()
}

function sleep(ms) {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomInt(min, max) {
  if (max <= min) return min
  return min + Math.floor(Math.random() * (max - min + 1))
}

function pickOne(values) {
  return values[Math.floor(Math.random() * values.length)]
}

async function readLinesFile(path, fallback) {
  if (!path) return fallback
  const content = await readFile(path, 'utf8')
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
  return lines.length > 0 ? lines : fallback
}

function sanitizeError(err) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message.slice(0, 500),
    }
  }
  return { name: 'Error', message: String(err).slice(0, 500) }
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function readTextResponse(response) {
  const text = await response.text().catch(() => '')
  return {
    bytes: Buffer.byteLength(text),
    text,
  }
}

async function readStreamingResponse(response, startMs) {
  if (!response.body) return { bytes: 0, firstChunkMs: null }

  const reader = response.body.getReader()
  let firstChunkMs = null
  let bytes = 0

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    if (value) {
      bytes += value.byteLength
      if (firstChunkMs === null) {
        firstChunkMs = Math.round(performance.now() - startMs)
      }
    }
  }

  return { bytes, firstChunkMs }
}

function jsonHeaders(extra = {}) {
  return {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
    ...extra,
  }
}

async function createChatSession(options) {
  const response = await fetchWithTimeout(
    buildApiUrl(options.baseUrl, '/api/chat/sessions'),
    {
      method: 'POST',
      headers: jsonHeaders({ cookie: options.cookie }),
      body: JSON.stringify({ repositoryId: options.repositoryId }),
    },
    options.timeoutMs,
  )

  if (!response.ok) {
    const { text } = await readTextResponse(response)
    throw new Error(`create chat session failed with HTTP ${response.status}: ${text.slice(0, 300)}`)
  }

  const body = await response.json()
  if (!body?.session?.id) throw new Error('create chat session response did not include session.id')
  return body.session.id
}

async function runChatScenario(options, question) {
  const started = performance.now()
  const sessionId = await createChatSession(options)
  const response = await fetchWithTimeout(
    buildApiUrl(options.baseUrl, '/api/chat'),
    {
      method: 'POST',
      headers: jsonHeaders({ cookie: options.cookie }),
      body: JSON.stringify({
        repositoryId: options.repositoryId,
        sessionId,
        message: question,
      }),
    },
    options.timeoutMs,
  )

  if (!response.ok) {
    const { bytes, text } = await readTextResponse(response)
    return {
      ok: false,
      statusCode: response.status,
      latencyMs: Math.round(performance.now() - started),
      firstChunkMs: null,
      bytes,
      error: text.slice(0, 500),
    }
  }

  const stream = await readStreamingResponse(response, started)
  return {
    ok: true,
    statusCode: response.status,
    latencyMs: Math.round(performance.now() - started),
    firstChunkMs: stream.firstChunkMs,
    bytes: stream.bytes,
  }
}

class McpClient {
  constructor(options) {
    this.options = options
    this.sessionId = null
    this.nextId = 1
  }

  async ensureSession() {
    if (this.sessionId) return

    const response = await this.post(
      {
        jsonrpc: '2.0',
        id: this.nextId++,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'convergekit-read-load', version: '1.0.0' },
        },
      },
      {},
    )

    if (!response.ok) {
      const { text } = await readTextResponse(response)
      throw new Error(`MCP initialize failed with HTTP ${response.status}: ${text.slice(0, 300)}`)
    }

    this.sessionId = response.headers.get('mcp-session-id')
    await readTextResponse(response)
    if (!this.sessionId) throw new Error('MCP initialize response did not include mcp-session-id')
  }

  async post(body, headers) {
    return fetchWithTimeout(
      buildApiUrl(this.options.baseUrl, '/api/mcp'),
      {
        method: 'POST',
        headers: jsonHeaders({
          authorization: `Bearer ${this.options.mcpToken}`,
          ...headers,
        }),
        body: JSON.stringify(body),
      },
      this.options.timeoutMs,
    )
  }

  async callTool(name, args) {
    await this.ensureSession()
    const response = await this.post(
      {
        jsonrpc: '2.0',
        id: this.nextId++,
        method: 'tools/call',
        params: { name, arguments: args },
      },
      { 'mcp-session-id': this.sessionId },
    )
    const { bytes, text } = await readTextResponse(response)
    let protocolError = false
    try {
      const body = JSON.parse(text)
      protocolError = Boolean(body?.error || body?.result?.isError)
    } catch {
      protocolError = text.includes('"isError":true') || text.includes('"error"')
    }

    if (response.status === 404 || response.status === 400) {
      this.sessionId = null
    }

    return {
      ok: response.ok && !protocolError,
      statusCode: response.status,
      bytes,
      error: protocolError ? text.slice(0, 500) : null,
    }
  }

  async close() {
    if (!this.sessionId) return
    await fetchWithTimeout(
      buildApiUrl(this.options.baseUrl, '/api/mcp'),
      {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${this.options.mcpToken}`,
          'mcp-session-id': this.sessionId,
        },
      },
      this.options.timeoutMs,
    ).catch(() => undefined)
    this.sessionId = null
  }
}

async function runMcpScenario(options, mcpClient, scenario, questions, paths) {
  const started = performance.now()
  const question = pickOne(questions)
  const path = pickOne(paths)

  const toolCall =
    scenario === 'mcpSearch'
      ? ['search_docs', { query: question, limit: options.mcpSearchLimit }]
      : scenario === 'mcpRead'
        ? ['read_file', { path }]
        : ['get_structure', {}]

  const result = await mcpClient.callTool(toolCall[0], toolCall[1])
  return {
    ok: result.ok,
    statusCode: result.statusCode,
    latencyMs: Math.round(performance.now() - started),
    firstChunkMs: null,
    bytes: result.bytes,
    ...(result.error ? { error: result.error } : {}),
  }
}

async function runScenario({ options, scenario, questions, paths, mcpClient }) {
  const startedAt = nowIso()
  const started = performance.now()
  try {
    const result =
      scenario === 'chat'
        ? await runChatScenario(options, pickOne(questions))
        : await runMcpScenario(options, mcpClient, scenario, questions, paths)

    return {
      startedAt,
      scenario,
      ...result,
    }
  } catch (err) {
    return {
      startedAt,
      scenario,
      ok: false,
      statusCode: null,
      latencyMs: Math.round(performance.now() - started),
      firstChunkMs: null,
      bytes: 0,
      error: sanitizeError(err),
    }
  }
}

function shouldContinue(state, options) {
  if (options.iterations > 0) return state.started < options.iterations
  return Date.now() < state.stopAt
}

function reserveIteration(state, options) {
  if (!shouldContinue(state, options)) return false
  state.started++
  return true
}

async function workerLoop(workerId, input) {
  const { options, questions, paths, pickScenario, state, emitResult } = input
  const mcpClient = options.mcpToken ? new McpClient(options) : null

  try {
    while (reserveIteration(state, options)) {
      const scenario = pickScenario()
      const result = await runScenario({ options, scenario, questions, paths, mcpClient })
      state.results.push({ workerId, ...result })
      emitResult({ workerId, ...result })

      if (options.maxThinkMs > 0) {
        await sleep(randomInt(options.minThinkMs, options.maxThinkMs))
      }
    }
  } finally {
    await mcpClient?.close()
  }
}

async function runLoad(options, questions, paths) {
  const pickScenario = createWeightedScenarioPicker(options.weights)
  const state = {
    started: 0,
    stopAt: Date.now() + options.durationSeconds * 1000,
    results: [],
  }
  const startedAt = Date.now()
  const emitResult = (result) => {
    if (options.jsonLines) {
      process.stdout.write(`${JSON.stringify({ event: 'result', ...result })}\n`)
    }
  }

  const progressTimer =
    options.progressSeconds > 0
      ? setInterval(() => {
          const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000)
          process.stderr.write(
            `${JSON.stringify({
              event: 'progress',
              elapsedSeconds,
              started: state.started,
              completed: state.results.length,
              summary: summarizeResults(state.results),
            })}\n`,
          )
        }, options.progressSeconds * 1000)
      : null

  const rampDelayMs =
    options.concurrency > 1 && options.rampSeconds > 0
      ? Math.floor((options.rampSeconds * 1000) / (options.concurrency - 1))
      : 0

  try {
    const workers = Array.from({ length: options.concurrency }, async (_, index) => {
      if (rampDelayMs > 0) await sleep(index * rampDelayMs)
      return workerLoop(index + 1, { options, questions, paths, pickScenario, state, emitResult })
    })
    await Promise.all(workers)
  } finally {
    if (progressTimer) clearInterval(progressTimer)
  }

  return {
    event: 'summary',
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: nowIso(),
    options: {
      baseUrl: options.baseUrl,
      repositoryId: options.repositoryId,
      durationSeconds: options.durationSeconds,
      iterations: options.iterations,
      concurrency: options.concurrency,
      rampSeconds: options.rampSeconds,
      timeoutMs: options.timeoutMs,
      weights: options.weights,
    },
    summary: summarizeResults(state.results),
  }
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(usage())
    return
  }

  const options = parseLoadOptions()
  const questions = await readLinesFile(options.questionsFile, DEFAULT_QUESTIONS)
  const paths = await readLinesFile(options.pathsFile, DEFAULT_PATHS)
  const summary = await runLoad(options, questions, paths)

  if (options.summaryFile) {
    await writeFile(options.summaryFile, `${JSON.stringify(summary, null, 2)}\n`)
  }

  if (options.jsonLines) {
    process.stdout.write(`${JSON.stringify(summary)}\n`)
  } else {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  }
}

main().catch((err) => {
  process.stderr.write(`${sanitizeError(err).message}\n\n${usage()}`)
  process.exitCode = 1
})
