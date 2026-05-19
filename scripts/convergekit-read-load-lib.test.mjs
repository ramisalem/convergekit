import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildApiUrl,
  createWeightedScenarioPicker,
  parseLoadOptions,
  percentile,
  summarizeResults,
} from './convergekit-read-load-lib.mjs'

describe('parseLoadOptions', () => {
  it('requires at least one authenticated scenario', () => {
    assert.throws(
      () =>
        parseLoadOptions([
          '--base-url',
          'https://convergekit.example.com',
          '--repository-id',
          '5d9f731a-a4f0-4d59-a7b7-0274d1169271',
        ]),
      /Provide --cookie for chat load or --mcp-token for MCP load/,
    )
  })

  it('keeps chat enabled when a cookie is provided and MCP token is absent', () => {
    const options = parseLoadOptions([
      '--base-url',
      'https://convergekit.example.com/',
      '--repository-id',
      '5d9f731a-a4f0-4d59-a7b7-0274d1169271',
      '--cookie',
      'better-auth.session_token=abc',
      '--concurrency',
      '12',
      '--duration-seconds',
      '90',
    ])

    assert.equal(options.baseUrl, 'https://convergekit.example.com')
    assert.equal(options.concurrency, 12)
    assert.equal(options.durationSeconds, 90)
    assert.equal(options.weights.chat, 70)
    assert.equal(options.weights.mcpSearch, 0)
    assert.equal(options.weights.mcpRead, 0)
    assert.equal(options.weights.mcpStructure, 0)
  })

  it('normalizes explicit weights and disables missing auth lanes', () => {
    const options = parseLoadOptions([
      '--base-url',
      'https://convergekit.example.com',
      '--repository-id',
      '5d9f731a-a4f0-4d59-a7b7-0274d1169271',
      '--mcp-token',
      'cwk_test',
      '--chat-weight',
      '90',
      '--mcp-search-weight',
      '10',
      '--mcp-read-weight',
      '5',
    ])

    assert.deepEqual(options.weights, {
      chat: 0,
      mcpSearch: 10,
      mcpRead: 5,
      mcpStructure: 5,
    })
  })
})

describe('buildApiUrl', () => {
  it('joins public origins with API paths', () => {
    assert.equal(
      buildApiUrl('https://convergekit.example.com', '/api/chat'),
      'https://convergekit.example.com/api/chat',
    )
  })

  it('does not duplicate /api when the base URL already includes it', () => {
    assert.equal(
      buildApiUrl('http://localhost:4001/api', '/api/mcp'),
      'http://localhost:4001/api/mcp',
    )
  })
})

describe('createWeightedScenarioPicker', () => {
  it('selects only scenarios with positive weight', () => {
    const pick = createWeightedScenarioPicker({
      chat: 0,
      mcpSearch: 10,
      mcpRead: 0,
      mcpStructure: 0,
    })

    assert.equal(pick(() => 0), 'mcpSearch')
    assert.equal(pick(() => 0.99), 'mcpSearch')
  })

  it('uses cumulative weight boundaries', () => {
    const pick = createWeightedScenarioPicker({
      chat: 70,
      mcpSearch: 20,
      mcpRead: 5,
      mcpStructure: 5,
    })

    assert.equal(pick(() => 0), 'chat')
    assert.equal(pick(() => 0.69), 'chat')
    assert.equal(pick(() => 0.7), 'mcpSearch')
    assert.equal(pick(() => 0.91), 'mcpRead')
    assert.equal(pick(() => 0.99), 'mcpStructure')
  })
})

describe('latency summaries', () => {
  it('computes nearest-rank percentiles', () => {
    assert.equal(percentile([100, 200, 300, 400, 500], 95), 500)
    assert.equal(percentile([500, 100, 300], 50), 300)
    assert.equal(percentile([], 95), null)
  })

  it('groups results by scenario with errors and first-chunk latency', () => {
    const summary = summarizeResults([
      { scenario: 'chat', ok: true, statusCode: 200, latencyMs: 1000, firstChunkMs: 250 },
      { scenario: 'chat', ok: true, statusCode: 200, latencyMs: 2000, firstChunkMs: 500 },
      { scenario: 'chat', ok: false, statusCode: 429, latencyMs: 100 },
      { scenario: 'mcpSearch', ok: true, statusCode: 200, latencyMs: 300 },
    ])

    assert.equal(summary.total.count, 4)
    assert.equal(summary.total.ok, 3)
    assert.equal(summary.total.errors, 1)
    assert.equal(summary.total.statusCodes['429'], 1)
    assert.equal(summary.scenarios.chat.count, 3)
    assert.equal(summary.scenarios.chat.p95Ms, 2000)
    assert.equal(summary.scenarios.chat.firstChunkP95Ms, 500)
    assert.equal(summary.scenarios.mcpSearch.p95Ms, 300)
  })
})
