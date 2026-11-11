import { z } from 'zod'

/**
 * Factory module configuration.
 *
 * The Factory module shows the progress of an AI software factory whose state lives on
 * GitHub (labels, status blocks and verdict comments on issues and PRs). Nothing about a
 * particular team is hard-coded: the list of repos and each repo's profile are read at
 * runtime from the hub repo named in FACTORY_HUB_REPO.
 */
export type FactoryConfig =
  | { enabled: false }
  | {
      enabled: true
      /** owner/name of the hub repo that holds the repo list and profiles. */
      hubRepo: string
      /** owner/name of the repo whose collaborators may open the module. */
      accessRepo: string
      /** Service token used to read the hub and check collaborators. */
      githubToken: string
      webhookSecret: string | null
      /** Optional GitHub Projects board URL shown as a link. */
      board: string | null
    }

const repoPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/

const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional()).optional()

const repoSchema = z.string().trim().regex(repoPattern, 'must look like owner/name')

const factoryEnvSchema = z.object({
  FACTORY_ENABLED: optional(z.enum(['true', 'false'])),
  FACTORY_HUB_REPO: optional(repoSchema),
  FACTORY_ACCESS_REPO: optional(repoSchema),
  FACTORY_GITHUB_TOKEN: optional(z.string().trim().min(1)),
  FACTORY_WEBHOOK_SECRET: optional(z.string().min(16, 'must be at least 16 characters')),
  FACTORY_BOARD: optional(z.string().url()),
})

export function resolveFactoryConfig(
  runtimeEnv: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): FactoryConfig {
  const result = factoryEnvSchema.safeParse(runtimeEnv)
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')} ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid factory configuration: ${details}`)
  }

  const value = result.data
  if (value.FACTORY_ENABLED !== 'true') return { enabled: false }

  const missing = [
    !value.FACTORY_HUB_REPO && 'FACTORY_HUB_REPO',
    !value.FACTORY_GITHUB_TOKEN && 'FACTORY_GITHUB_TOKEN',
  ].filter(Boolean)
  if (missing.length > 0) {
    throw new Error(
      `Invalid factory configuration: FACTORY_ENABLED=true needs ${missing.join(' and ')}`,
    )
  }

  const hubRepo = value.FACTORY_HUB_REPO as string
  return {
    enabled: true,
    hubRepo,
    accessRepo: value.FACTORY_ACCESS_REPO ?? hubRepo,
    githubToken: value.FACTORY_GITHUB_TOKEN as string,
    webhookSecret: value.FACTORY_WEBHOOK_SECRET ?? null,
    board: value.FACTORY_BOARD ?? null,
  }
}
