import type { AccessPolicyConfig } from '@convergekit/config/access-policy'
import { accessPolicyConfig } from '@convergekit/config/access-policy'
import { APIError, type BetterAuthPlugin } from 'better-auth'
import { createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { z } from 'zod'

import {
  WORKFORCE_SAML_PROVIDER_ID,
  normalizeSamlEmail,
  resolveRelayState,
  resolveWorkforceSamlSignIn,
} from './workforce-saml-policy.js'
import { assertSamlReplayAllowed, type SamlReplayCache } from './workforce-saml-replay.js'
import type { ValidatedSamlResponse } from './workforce-saml-service.js'

type WorkforceSamlService = {
  getMetadata(): string
  createLoginUrl(relayState?: string): Promise<string>
  validateResponse(input: {
    samlResponse: string
    relayState?: string
  }): Promise<ValidatedSamlResponse>
}

export type WorkforceSamlPluginOptions = {
  service: WorkforceSamlService | null
  replayCache?: SamlReplayCache | null
  accessPolicy?: AccessPolicyConfig
  countAdmins: () => Promise<number>
  onAccountLinked?: (accountData: { providerId?: string; userId?: string }) => Promise<void> | void
}

const samlAcsBodySchema = z.object({
  SAMLResponse: z.string().min(1),
  RelayState: z.string().optional(),
})

const samlLoginQuerySchema = z
  .object({
    RelayState: z.string().optional(),
  })
  .optional()

function toExistingWorkforceUser(record: Record<string, unknown>) {
  const role: 'admin' | 'user' = record.role === 'admin' ? 'admin' : 'user'
  return {
    id: String(record.id),
    email: String(record.email),
    role,
    groupId: typeof record.groupId === 'string' ? record.groupId : null,
    deactivatedAt: record.deactivatedAt instanceof Date ? record.deactivatedAt : null,
  }
}

function toSamlError(error: unknown): never {
  if (error instanceof APIError) throw error
  throw APIError.from('UNAUTHORIZED', {
    code: 'SAML_SIGN_IN_FAILED',
    message: error instanceof Error ? error.message : 'SAML sign-in failed',
  })
}

function logSamlDenied(error: unknown) {
  console.warn({
    event: 'auth.saml.denied',
    code: error instanceof APIError ? error.body?.code : 'SAML_SIGN_IN_FAILED',
    message: error instanceof Error ? error.message : 'SAML sign-in failed',
  })
}

function logSamlProvisioned(input: { userId: string; email: string }) {
  console.info({
    event: 'auth.saml.provisioned',
    userId: input.userId,
    emailDomain: input.email.split('@')[1] ?? null,
  })
}

export function workforceSamlPlugin(options: WorkforceSamlPluginOptions): BetterAuthPlugin {
  return {
    id: 'workforce-saml',
    endpoints: {
      workforceSamlMetadata: createAuthEndpoint(
        '/workforce-saml/metadata',
        {
          method: 'GET',
        },
        async () => {
          try {
            if (!options.service) throw new Error('Workforce SSO is not configured')

            return new Response(options.service.getMetadata(), {
              headers: { 'content-type': 'application/samlmetadata+xml' },
            })
          } catch (error) {
            logSamlDenied(error)
            toSamlError(error)
          }
        },
      ),
      workforceSamlLogin: createAuthEndpoint(
        '/workforce-saml/login',
        {
          method: 'GET',
          query: samlLoginQuerySchema,
        },
        async (ctx) => {
          try {
            if (!options.service) throw new Error('Workforce SSO is not configured')

            return ctx.redirect(
              await options.service.createLoginUrl(resolveRelayState(ctx.query?.RelayState)),
            )
          } catch (error) {
            logSamlDenied(error)
            toSamlError(error)
          }
        },
      ),
      workforceSamlAcs: createAuthEndpoint(
        '/workforce-saml/acs',
        {
          method: 'POST',
          body: samlAcsBodySchema,
          metadata: {
            allowedMediaTypes: ['application/x-www-form-urlencoded', 'application/json'],
          },
        },
        async (ctx) => {
          try {
            if (!options.service) throw new Error('Workforce SSO is not configured')

            const validated = await options.service.validateResponse({
              samlResponse: ctx.body.SAMLResponse,
              relayState: ctx.body.RelayState,
            })
            if (validated.notOnOrAfter.getTime() <= Date.now()) {
              throw new Error('SAML assertion has expired')
            }

            const accessPolicy = options.accessPolicy ?? accessPolicyConfig
            const email = normalizeSamlEmail(validated.email, accessPolicy)

            await assertSamlReplayAllowed({
              assertionId: validated.assertionId,
              expiresAt: validated.notOnOrAfter,
              cache: options.replayCache,
            })

            const existing = await ctx.context.internalAdapter.findUserByEmail(email, {
              includeAccounts: true,
            })
            const decision = resolveWorkforceSamlSignIn({
              email,
              adminCount: await options.countAdmins(),
              existingUser: existing ? toExistingWorkforceUser(existing.user) : null,
              accessPolicy,
            })

            if (!decision.allowed) throw new Error(`SAML sign-in denied: ${decision.code}`)

            const user =
              decision.action === 'reuse'
                ? existing?.user
                : await ctx.context.internalAdapter.createUser({
                    email,
                    name: validated.name ?? email,
                    emailVerified: true,
                    role: decision.data.role,
                    groupId: decision.data.groupId,
                    __source: WORKFORCE_SAML_PROVIDER_ID,
                  })

            if (!user) throw new Error('Failed to create or load SAML user')
            if (decision.action === 'create') logSamlProvisioned({ userId: user.id, email })

            const accounts = existing?.accounts ?? []
            const hasSamlAccount = accounts.some(
              (account) =>
                account.providerId === WORKFORCE_SAML_PROVIDER_ID && account.accountId === email,
            )
            if (!hasSamlAccount) {
              await ctx.context.internalAdapter.linkAccount({
                userId: user.id,
                providerId: WORKFORCE_SAML_PROVIDER_ID,
                accountId: email,
              })
              await options.onAccountLinked?.({
                providerId: WORKFORCE_SAML_PROVIDER_ID,
                userId: user.id,
              })
            }

            const session = await ctx.context.internalAdapter.createSession(user.id)
            if (!session) throw new Error('Failed to create SAML session')

            await setSessionCookie(ctx, { session, user })
            return ctx.redirect(resolveRelayState(validated.relayState ?? ctx.body.RelayState))
          } catch (error) {
            logSamlDenied(error)
            toSamlError(error)
          }
        },
      ),
    },
  }
}
