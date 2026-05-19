import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export const EXPECTED_MCP_TOOLS = ['get_structure', 'read_file', 'search_docs'] as const

type CheckStatus = 'passed' | 'failed' | 'skipped'

type Check = {
  status: CheckStatus
  message: string
}

export type McpConnectionTestResult = {
  ok: boolean
  endpoint: string
  latencyMs: number
  checks: {
    endpoint: Check
    auth: Check
    tools: Check
  }
  tools: {
    expected: string[]
    found: string[]
    missing: string[]
  }
  error?: string
}

type SummarizeMcpConnectionTestInput = {
  endpoint: string
  latencyMs: number
  expectedTools?: string[]
  toolNames?: string[]
  error?: unknown
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function isEndpointFailure(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase()
  return (
    message.includes('fetch failed') ||
    message.includes('failed to fetch') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('aborted') ||
    message.includes('invalid url') ||
    message.includes('not found') ||
    message.includes('404')
  )
}

export function summarizeMcpConnectionTest({
  endpoint,
  latencyMs,
  expectedTools,
  toolNames,
  error,
}: SummarizeMcpConnectionTestInput): McpConnectionTestResult {
  const expected = expectedTools ?? [...EXPECTED_MCP_TOOLS]
  const found = toolNames?.sort() ?? []
  const missing = expected.filter((tool) => !found.includes(tool))

  if (error) {
    const endpointFailed = isEndpointFailure(error)
    return {
      ok: false,
      endpoint,
      latencyMs,
      checks: {
        endpoint: {
          status: endpointFailed ? 'failed' : 'passed',
          message: endpointFailed ? 'Endpoint could not be reached.' : 'Endpoint is reachable.',
        },
        auth: {
          status: endpointFailed ? 'skipped' : 'failed',
          message: endpointFailed
            ? 'Authentication was not checked.'
            : 'Token authentication failed.',
        },
        tools: { status: 'skipped', message: 'Tool listing was skipped.' },
      },
      tools: { expected, found: [], missing: expected },
      error: errorMessage(error),
    }
  }

  const toolsOk = missing.length === 0

  return {
    ok: toolsOk,
    endpoint,
    latencyMs,
    checks: {
      endpoint: { status: 'passed', message: 'Endpoint is reachable.' },
      auth: { status: 'passed', message: 'Token authentication succeeded.' },
      tools: {
        status: toolsOk ? 'passed' : 'failed',
        message: toolsOk
          ? 'All expected MCP tools are available.'
          : `Missing MCP tools: ${missing.join(', ')}`,
      },
    },
    tools: { expected, found, missing },
  }
}

export async function runMcpConnectionTest({
  endpoint,
  token,
  expectedTools,
  timeoutMs = 10_000,
}: {
  endpoint: string
  token: string
  expectedTools?: string[]
  timeoutMs?: number
}): Promise<McpConnectionTestResult> {
  const startedAt = Date.now()
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), timeoutMs)
  let client: Client | null = null

  try {
    const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: {
        headers: { Authorization: `Bearer ${token}` },
        signal: abortController.signal,
      },
    })
    client = new Client({ name: 'convergekit-connection-test', version: '1.0.0' })
    await client.connect(transport)
    const tools = await client.listTools()

    return summarizeMcpConnectionTest({
      endpoint,
      latencyMs: Date.now() - startedAt,
      expectedTools,
      toolNames: tools.tools.map((tool) => tool.name),
    })
  } catch (err) {
    return summarizeMcpConnectionTest({
      endpoint,
      latencyMs: Date.now() - startedAt,
      expectedTools,
      error: err,
    })
  } finally {
    clearTimeout(timeout)
    await client?.close().catch(() => undefined)
  }
}
