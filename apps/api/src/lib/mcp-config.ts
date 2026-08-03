type McpConfigEnv = {
  API_BASE_URL?: string
  BETTER_AUTH_URL?: string
}

type BuildMcpTokenConfigInput = {
  tokenId: string
  label: string
  repositoryName?: string
  rawToken?: string
  env?: McpConfigEnv
}

type McpServerConfig = {
  mcpServers: Record<
    string,
    | {
        url: string
        headers: {
          Authorization: string
        }
      }
    | {
        command: string
        args: string[]
        env: Record<string, string>
      }
  >
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

function trimMcpApiBasePath(value: string): string {
  return trimTrailingSlashes(value).replace(/\/api\/auth$/, '').replace(/\/api$/, '')
}

function nonEmptyEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function resolveMcpApiBaseUrl(env: McpConfigEnv): string {
  return trimMcpApiBasePath(
    nonEmptyEnvValue(env.API_BASE_URL) ??
      nonEmptyEnvValue(env.BETTER_AUTH_URL) ??
      'http://localhost:4001',
  )
}

function slugifyRepositoryName(repositoryName: string | undefined): string | null {
  const slug = repositoryName
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || null
}

function resolveMcpServerName(repositoryName: string | undefined): string {
  const repositorySlug = slugifyRepositoryName(repositoryName)
  return repositorySlug ? `${repositorySlug}-colab-ai-hub` : 'colab-ai-hub'
}

export function buildMcpTokenConfig({
  tokenId,
  label,
  repositoryName,
  rawToken,
  env = process.env,
}: BuildMcpTokenConfigInput) {
  const mcpEndpoint = `${resolveMcpApiBaseUrl(env)}/api/mcp`
  const mcpServerName = resolveMcpServerName(repositoryName)
  const authorization = `Bearer ${rawToken ?? '<paste-your-token-here>'}`

  const config: McpServerConfig = {
    mcpServers: {
      [mcpServerName]: {
        url: mcpEndpoint,
        headers: { Authorization: authorization },
      },
    },
  }
  const claudeDesktopConfig: McpServerConfig = {
    mcpServers: {
      [mcpServerName]: {
        command: '/opt/homebrew/bin/npx',
        args: [
          '-y',
          'mcp-remote@latest',
          mcpEndpoint,
          '--transport',
          'http-only',
          '--header',
          'Authorization:${COLAB_AI_HUB_MCP_AUTH}',
        ],
        env: { COLAB_AI_HUB_MCP_AUTH: authorization },
      },
    },
  }
  const clientConfigs = {
    claudeDesktop: {
      label: 'Claude Desktop',
      description:
        'Add this server under Claude Desktop MCP settings. If npx is elsewhere, replace command with the output of which npx.',
      config: claudeDesktopConfig,
    },
    cursor: {
      label: 'Cursor',
      description: 'Add this server under Cursor MCP settings.',
      config,
    },
    generic: {
      label: 'Generic JSON',
      description: 'Use this with any Streamable HTTP MCP client that accepts JSON server config.',
      config,
    },
  }

  return {
    tokenId,
    label,
    mcpServerName,
    mcpEndpoint,
    note: 'Replace <paste-your-token-here> with the token shown at creation time.',
    config,
    clientConfigs,
  }
}
