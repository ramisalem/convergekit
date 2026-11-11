import { accessPolicyConfig } from '@convergekit/config/access-policy'
import { resolveFactoryConfig } from '@convergekit/config/factory'
import { resolveMcpOAuthConfig } from '@convergekit/config/mcp-oauth'
import { resolveWorkforceSsoConfig } from '@convergekit/config/workforce-sso'
import {
  account,
  db,
  groups,
  oauthAccessToken,
  oauthApplication,
  oauthConsent,
  session,
  user,
  verification,
} from '@convergekit/db'
import { createFactoryGitHub } from '@convergekit/factory/github'
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
import {
  createFactoryMemberCheck,
  createFactoryMemberGroups,
  createGitHubLoginMemory,
} from './factory-member-signup.js'
import { completePendingInvitesForLinkedAccount } from './invitation-completion.js'
import { buildMcpOAuthPlugins } from './mcp-oauth-plugin.js'
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

// Optional: collaborators on the factory access repo may create their own (non-admin)
// account by signing in with GitHub. Off unless FACTORY_MEMBER_SIGNUP=true.
const factoryConfig = resolveFactoryConfig()
const githubLogins = createGitHubLoginMemory()
const isFactoryMember = createFactoryMemberCheck({
  config: factoryConfig,
  github: factoryConfig.enabled ? createFactoryGitHub({ token: factoryConfig.githubToken }) : null,
  logins: githubLogins,
  warn: (details) => console.warn(details),
})
// Optional: those members join the group named by FACTORY_MEMBER_GROUP, so they see the
// repositories an admin assigned to it.
const factoryMemberGroups = createFactoryMemberGroups({
  config: factoryConfig,
  async findGroupId(name) {
    const [row] = await db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.name, name))
      .limit(1)
    return row?.id ?? null
  },
  async setUserGroup(userId, groupId) {
    await db.update(user).set({ groupId }).where(eq(user.id, userId))
  },
  warn: (details) => console.warn(details),
})

const socialProviders = buildAuthSocialProviders({
  githubClientId,
  githubClientSecret,
  onGitHubProfile: ({ login, email }) => {
    if (factoryConfig.enabled && factoryConfig.memberSignup && email) {
      githubLogins.remember(email, login)
    }
  },
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
    schema: { user, session, account, verification, oauthApplication, oauthAccessToken, oauthConsent },
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
    ...buildMcpOAuthPlugins(resolveMcpOAuthConfig(process.env)),
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

          const providerId =
            (userData as { __source?: unknown }).__source === WORKFORCE_SAML_PROVIDER_ID
              ? null
              : getOAuthProviderIdFromContext(context)

          const factoryMember = providerId === 'github' && (await isFactoryMember(userData))
          const result = resolveOAuthUserCreate({
            providerId,
            adminCount: count,
            initialAdminEmail,
            accessPolicy: accessPolicyConfig,
            factoryMember,
            userData,
          })
          if (factoryMember && 'role' in result.data && result.data.role === 'user') {
            factoryMemberGroups.markNewMember(String(result.data.email))
          }
          return result
        },
        after: async (createdUser) => {
          await factoryMemberGroups.onUserCreated(createdUser)
        },
      },
    },
  },
})

export type Auth = typeof auth
export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
