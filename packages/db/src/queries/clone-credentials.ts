import { and, eq } from 'drizzle-orm'
import { db } from '../client.js'
import { account, repositories } from '../schema.js'

export function buildAuthenticatedCloneUrl(cloneUrl: string, token: string): string {
  const parsed = new URL(cloneUrl)
  parsed.username = 'x-oauth-token'
  parsed.password = token
  return parsed.toString()
}

/**
 * Resolve a clone URL with embedded credentials for private GitHub repos.
 * Returns null when a private repo has no usable stored token. Never expose
 * the result to API responses.
 */
export async function resolveAuthenticatedCloneUrl(repositoryId: string): Promise<string | null> {
  const [repo] = await db
    .select({
      userId: repositories.userId,
      cloneUrl: repositories.cloneUrl,
      provider: repositories.provider,
      isPrivate: repositories.isPrivate,
    })
    .from(repositories)
    .where(eq(repositories.id, repositoryId))
    .limit(1)
  if (!repo) return null
  if (repo.provider !== 'github' || !repo.isPrivate) return repo.cloneUrl

  const githubAccount = await db.query.account.findFirst({
    where: and(eq(account.userId, repo.userId), eq(account.providerId, 'github')),
  })
  if (!githubAccount?.accessToken) return null
  return buildAuthenticatedCloneUrl(repo.cloneUrl, githubAccount.accessToken)
}
