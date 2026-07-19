import { z } from 'zod'

export type McpOAuthConfig = {
  enabled: boolean
  issuerUrl: string | null
  resourceUrl: string | null
  loginUrl: string | null
  consentUrl: string | null
}

const optionalNonEmpty = z
  .string()
  .trim()
  .min(1)
  .optional()
  .or(z.literal('').transform(() => undefined))
  .transform((value) => value || undefined)

const mcpOAuthEnvSchema = z.object({
  MCP_OAUTH_ENABLED: z.enum(['true', 'false']).optional().default('false'),
  MCP_OAUTH_ISSUER_URL: optionalNonEmpty,
  WEB_APP_URL: optionalNonEmpty,
})

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

export function resolveMcpOAuthConfig(
  runtimeEnv: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): McpOAuthConfig {
  const result = mcpOAuthEnvSchema.safeParse(runtimeEnv)
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid MCP OAuth configuration: ${details}`)
  }

  const enabled = result.data.MCP_OAUTH_ENABLED === 'true'

  if (!enabled) {
    return { enabled: false, issuerUrl: null, resourceUrl: null, loginUrl: null, consentUrl: null }
  }

  const rawIssuer = result.data.MCP_OAUTH_ISSUER_URL
  if (!rawIssuer) {
    throw new Error(
      'Invalid MCP OAuth configuration: MCP_OAUTH_ISSUER_URL is required when MCP_OAUTH_ENABLED=true',
    )
  }
  if (!z.string().url().safeParse(rawIssuer).success) {
    throw new Error('Invalid MCP OAuth configuration: MCP_OAUTH_ISSUER_URL must be a valid URL')
  }

  const issuerUrl = stripTrailingSlash(rawIssuer)
  const webAppUrl = stripTrailingSlash(result.data.WEB_APP_URL ?? issuerUrl)
  return {
    enabled: true,
    issuerUrl,
    resourceUrl: `${issuerUrl}/api/mcp`,
    loginUrl: `${webAppUrl}/auth/sign-in`,
    consentUrl: `${webAppUrl}/mcp/consent`,
  }
}
