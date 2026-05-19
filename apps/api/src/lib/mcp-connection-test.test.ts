import { describe, expect, it } from 'vitest'
import { EXPECTED_MCP_TOOLS, summarizeMcpConnectionTest } from './mcp-connection-test.js'

describe('summarizeMcpConnectionTest', () => {
  it('passes when the client connects and all expected tools are listed', () => {
    const result = summarizeMcpConnectionTest({
      endpoint: 'http://localhost:4001/api/mcp',
      latencyMs: 42,
      toolNames: [...EXPECTED_MCP_TOOLS],
    })

    expect(result.ok).toBe(true)
    expect(result.checks.endpoint.status).toBe('passed')
    expect(result.checks.auth.status).toBe('passed')
    expect(result.checks.tools.status).toBe('passed')
    expect(result.tools.missing).toEqual([])
  })

  it('fails when required tools are missing', () => {
    const result = summarizeMcpConnectionTest({
      endpoint: 'http://localhost:4001/api/mcp',
      latencyMs: 42,
      toolNames: ['read_file'],
    })

    expect(result.ok).toBe(false)
    expect(result.checks.tools.status).toBe('failed')
    expect(result.tools.missing).toEqual(['get_structure', 'search_docs'])
  })

  it('checks only the tools expected for the token scopes', () => {
    const result = summarizeMcpConnectionTest({
      endpoint: 'http://localhost:4001/api/mcp',
      latencyMs: 42,
      expectedTools: ['get_structure'],
      toolNames: ['get_structure'],
    })

    expect(result.ok).toBe(true)
    expect(result.tools.expected).toEqual(['get_structure'])
    expect(result.tools.missing).toEqual([])
  })

  it('reports auth failure details when the SDK connection fails', () => {
    const result = summarizeMcpConnectionTest({
      endpoint: 'http://localhost:4001/api/mcp',
      latencyMs: 42,
      error: new Error('Unauthorized'),
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Unauthorized')
    expect(result.checks.endpoint.status).toBe('passed')
    expect(result.checks.auth.status).toBe('failed')
    expect(result.checks.tools.status).toBe('skipped')
  })

  it('separates endpoint failures from auth failures', () => {
    const result = summarizeMcpConnectionTest({
      endpoint: 'http://localhost:4001/api/mcp',
      latencyMs: 42,
      error: new TypeError('fetch failed'),
    })

    expect(result.ok).toBe(false)
    expect(result.checks.endpoint.status).toBe('failed')
    expect(result.checks.auth.status).toBe('skipped')
    expect(result.checks.tools.status).toBe('skipped')
  })

  it('reports 404 responses as endpoint path failures', () => {
    const result = summarizeMcpConnectionTest({
      endpoint: 'https://convergekit.example.com/api/api/mcp',
      latencyMs: 42,
      error: new Error('Streamable HTTP error: Error POSTing to endpoint: {"error":"Not found"}'),
    })

    expect(result.ok).toBe(false)
    expect(result.checks.endpoint.status).toBe('failed')
    expect(result.checks.auth.status).toBe('skipped')
    expect(result.checks.tools.status).toBe('skipped')
  })
})
