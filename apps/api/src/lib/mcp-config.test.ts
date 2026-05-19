import { describe, expect, it } from 'vitest'
import { buildMcpTokenConfig } from './mcp-config.js'

describe('buildMcpTokenConfig', () => {
  it('uses a repository-specific MCP server name when a repository name is provided', () => {
    const payload = buildMcpTokenConfig({
      tokenId: 'token-1',
      label: 'cursor-dev',
      repositoryName: 'example-backend',
      env: { API_BASE_URL: 'http://localhost:4001' },
    })

    expect(payload.mcpServerName).toBe('example-backend-convergekit')
    expect(Object.keys(payload.config.mcpServers)).toEqual(['example-backend-convergekit'])
    expect(payload.config.mcpServers['example-backend-convergekit']?.url).toBe(
      'http://localhost:4001/api/mcp',
    )
  })

  it('normalizes repository names before appending the MCP suffix', () => {
    const payload = buildMcpTokenConfig({
      tokenId: 'token-1',
      label: 'cursor-dev',
      repositoryName: 'Example Backend API!',
      env: { API_BASE_URL: 'http://localhost:4001' },
    })

    expect(payload.mcpServerName).toBe('example-backend-api-convergekit')
  })

  it('uses API_BASE_URL when it is configured', () => {
    const payload = buildMcpTokenConfig({
      tokenId: 'token-1',
      label: 'cursor-dev',
      repositoryName: 'example-backend',
      env: {
        API_BASE_URL: 'https://convergekit.example.com',
        BETTER_AUTH_URL: 'http://localhost:4001',
      },
    })

    expect(payload.mcpEndpoint).toBe('https://convergekit.example.com/api/mcp')
    expect(payload.config.mcpServers['example-backend-convergekit']?.url).toBe(
      'https://convergekit.example.com/api/mcp',
    )
    expect(payload.clientConfigs.cursor.config.mcpServers['example-backend-convergekit']?.url).toBe(
      'https://convergekit.example.com/api/mcp',
    )
  })

  it('generates a Claude Desktop mcp-remote bridge config for macOS users', () => {
    const payload = buildMcpTokenConfig({
      tokenId: 'token-1',
      label: 'cursor-dev',
      repositoryName: 'example-backend',
      rawToken: 'convergekit_test_token',
      env: {
        API_BASE_URL: 'https://convergekit.example.com/api',
      },
    })

    expect(payload.clientConfigs.claudeDesktop.config.mcpServers['example-backend-convergekit']).toEqual(
      {
        command: '/opt/homebrew/bin/npx',
        args: [
          '-y',
          'mcp-remote@latest',
          'https://convergekit.example.com/api/mcp',
          '--transport',
          'http-only',
          '--header',
          'Authorization:${CONVERGEKIT_MCP_AUTH}',
        ],
        env: {
          CONVERGEKIT_MCP_AUTH: 'Bearer convergekit_test_token',
        },
      },
    )
  })

  it('does not duplicate the API path when API_BASE_URL already includes it', () => {
    const payload = buildMcpTokenConfig({
      tokenId: 'token-1',
      label: 'cursor-dev',
      repositoryName: 'example-backend',
      env: {
        API_BASE_URL: 'https://convergekit.example.com/api',
      },
    })

    expect(payload.mcpEndpoint).toBe('https://convergekit.example.com/api/mcp')
  })

  it('falls back to BETTER_AUTH_URL before the local default', () => {
    const payload = buildMcpTokenConfig({
      tokenId: 'token-1',
      label: 'cursor-dev',
      repositoryName: 'example-backend',
      env: {
        BETTER_AUTH_URL: 'http://localhost:4001',
      },
    })

    expect(payload.mcpEndpoint).toBe('http://localhost:4001/api/mcp')
  })

  it('derives the MCP endpoint from BETTER_AUTH_URL when it includes the auth route', () => {
    const payload = buildMcpTokenConfig({
      tokenId: 'token-1',
      label: 'cursor-dev',
      repositoryName: 'example-backend',
      env: {
        BETTER_AUTH_URL: 'https://convergekit.example.com/api/auth',
      },
    })

    expect(payload.mcpEndpoint).toBe('https://convergekit.example.com/api/mcp')
  })

  it('treats an empty API_BASE_URL as unset', () => {
    const payload = buildMcpTokenConfig({
      tokenId: 'token-1',
      label: 'cursor-dev',
      repositoryName: 'example-backend',
      env: {
        API_BASE_URL: '',
        BETTER_AUTH_URL: 'http://localhost:4001',
      },
    })

    expect(payload.mcpEndpoint).toBe('http://localhost:4001/api/mcp')
  })

  it('defaults to the documented local API port', () => {
    const payload = buildMcpTokenConfig({
      tokenId: 'token-1',
      label: 'cursor-dev',
      repositoryName: 'example-backend',
      env: {},
    })

    expect(payload.mcpEndpoint).toBe('http://localhost:4001/api/mcp')
  })

  it('keeps placeholders when no raw token is provided', () => {
    const payload = buildMcpTokenConfig({
      tokenId: 'token-1',
      label: 'cursor-dev',
      repositoryName: 'example-backend',
      env: { API_BASE_URL: 'http://localhost:4001' },
    })

    expect(payload.config.mcpServers['example-backend-convergekit']?.headers.Authorization).toBe(
      'Bearer <paste-your-token-here>',
    )
    expect(
      payload.clientConfigs.claudeDesktop.config.mcpServers['example-backend-convergekit']?.env
        ?.CONVERGEKIT_MCP_AUTH,
    ).toBe('Bearer <paste-your-token-here>')
  })

  it('embeds the one-time raw token when provided', () => {
    const payload = buildMcpTokenConfig({
      tokenId: 'token-1',
      label: 'cursor-dev',
      repositoryName: 'example-backend',
      rawToken: 'convergekit_test_token',
      env: { API_BASE_URL: 'http://localhost:4001' },
    })

    expect(payload.config.mcpServers['example-backend-convergekit']?.headers.Authorization).toBe(
      'Bearer convergekit_test_token',
    )
    expect(
      payload.clientConfigs.generic.config.mcpServers['example-backend-convergekit']?.headers
        .Authorization,
    ).toBe('Bearer convergekit_test_token')
    expect(
      payload.clientConfigs.claudeDesktop.config.mcpServers['example-backend-convergekit']?.env
        ?.CONVERGEKIT_MCP_AUTH,
    ).toBe('Bearer convergekit_test_token')
  })
})
