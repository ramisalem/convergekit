import { auth } from '@convergekit/auth'
import { accessPolicyConfig, isAllowedAccessPolicyEmail } from '@convergekit/config/access-policy'
import { resolveWorkforceSsoConfig } from '@convergekit/config/workforce-sso'
import { Hono } from 'hono'
import { wellKnownRoutes } from './well-known.js'

export const authRoutes = new Hono()
const workforceSsoConfig = resolveWorkforceSsoConfig(process.env, accessPolicyConfig)

// Public workforce SSO config; registered before auth.handler catch-all to take precedence.
authRoutes.get('/config', (c) =>
  c.json({
    workforceSsoEnabled: workforceSsoConfig.workforceSsoEnabled,
    workforceSsoProviderLabel: workforceSsoConfig.providerLabel,
  }),
)

authRoutes.post('/sign-in/email', async (c) => {
  // Hard-deprecate email/password sign-in when workforce SSO is enabled. Defense-in-depth:
  // the UI hides the form, but we also refuse direct API calls (curl, scripted clients) so
  // there is exactly one supported sign-in path for end users in SSO-on environments.
  if (workforceSsoConfig.workforceSsoEnabled) {
    return c.json(
      {
        error: 'Email/password sign-in is disabled. Please use Colab Ai Hub SSO.',
        code: 'EMAIL_SIGN_IN_DISABLED',
      },
      403,
    )
  }

  const body = (await c.req.raw
    .clone()
    .json()
    .catch(() => null)) as { email?: unknown } | null
  const email = typeof body?.email === 'string' ? body.email : ''

  if (!isAllowedAccessPolicyEmail(email, accessPolicyConfig)) {
    return c.json(
      { error: `Email must use the ${accessPolicyConfig.allowedEmailDomain} domain` },
      403,
    )
  }

  return auth.handler(c.req.raw)
})

// Shadow the better-auth MCP plugin's stale /.well-known docs with ours.
authRoutes.route('/.well-known', wellKnownRoutes)

// Forward all /api/auth/* requests to the better-auth handler.
// better-auth handles OAuth redirects, callbacks, session management, and sign-out.
authRoutes.all('/*', (c) => auth.handler(c.req.raw))
