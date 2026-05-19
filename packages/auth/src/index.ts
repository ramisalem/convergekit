import { accessPolicyConfig } from '@convergekit/config/access-policy'
import { resolveWorkforceSsoConfig } from '@convergekit/config/workforce-sso'
import { account, db, session, user, verification } from '@convergekit/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { eq, sql } from 'drizzle-orm'
import {
  buildAccountPolicyConfig,
  buildAdvancedAuthConfig,
  buildSessionPolicyConfig,
} from './account-policy.js'
import {
  authUserAdditionalFields,
  getOAuthProviderIdFromContext,
  resolveOAuthUserCreate,
} from './bootstrap-admin.js'
import { completePendingInvitesForLinkedAccount } from './invitation-completion.js'
import { buildAuthSocialProviders } from './social-providers.js'
import { WORKFORCE_SAML_PROVIDER_ID } from './workforce-saml-policy.js'
import { workforceSamlPlugin } from './workforce-saml-plugin.js'
import { buildWorkforceSamlService } from './workforce-saml-service.js'

const githubClientId = process.env.GITHUB_CLIENT_ID
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET
const secret = process.env.BETTER_AUTH_SECRET
const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL
const workforceSsoConfig = resolveWorkforceSsoConfig(process.env, accessPolicyConfig)
const sessionTtlDays = workforceSsoConfig.sessionTtlDays

if (!githubClientId || !githubClientSecret || !secret) {
  throw new Error(
    'Missing required auth env vars: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, BETTER_AUTH_SECRET',
  )
}

const socialProviders = buildAuthSocialProviders({
  githubClientId,
  githubClientSecret,
})
const workforceSamlService = buildWorkforceSamlService(workforceSsoConfig)

const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:3000'

export const auth = betterAuth({
  secret,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3001',
  trustedOrigins: [webAppUrl],
  user: {
    additionalFields: authUserAdditionalFields,
  },
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  socialProviders,
  emailAndPassword: {
    enabled: true,
    // Users cannot self-register. Accounts are created by admins via the API.
    disableSignUp: true,
    autoSignIn: false,
  },
  account: buildAccountPolicyConfig(),
  session: buildSessionPolicyConfig(sessionTtlDays),
  plugins: [
    workforceSamlPlugin({
      service: workforceSamlService,
      accessPolicy: accessPolicyConfig,
      countAdmins: async () => {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(user)
          .where(eq(user.role, 'admin'))
        return count
      },
      onAccountLinked: completePendingInvitesForLinkedAccount,
    }),
  ],
  advanced: buildAdvancedAuthConfig({
    nodeEnv: process.env.NODE_ENV,
    workforceSsoEnabled: workforceSsoConfig.workforceSsoEnabled,
  }),
  databaseHooks: {
    user: {
      create: {
        before: async (userData, context) => {
          // This hook fires when better-auth is about to create a new user
          // during OAuth sign-in. We use it to enforce provider-role rules.

          // Count existing admins
          const [{ count }] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(user)
            .where(eq(user.role, 'admin'))

          return resolveOAuthUserCreate({
            providerId:
              (userData as { __source?: unknown }).__source === WORKFORCE_SAML_PROVIDER_ID
                ? null
                : getOAuthProviderIdFromContext(context),
            adminCount: count,
            initialAdminEmail,
            accessPolicy: accessPolicyConfig,
            userData,
          })
        },
      },
    },
  },
})

export type Auth = typeof auth
export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
