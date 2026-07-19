import {
  branches,
  db,
  documents,
  groupRepositories,
  groups,
  mcpOauthAuthorizationCode,
  mcpOauthToken,
  mcpTokens,
  oauthApplication,
  repositories,
  session,
  user,
} from '@convergekit/db'
import { makeSignature } from 'better-auth/crypto'
import { eq, inArray } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createMcpTokenSecret } from '../../src/lib/mcp-token-policy.js'
import { SMOKE, SMOKE_CLONE_URL, SMOKE_EMAIL_A, SMOKE_EMAIL_B } from './constants.js'
import { assertLocalDatabase } from './guard.js'

export type SeedHandles = {
  userA: { id: string; email: string }
  userB: { id: string; email: string }
  repoId: string
  docPath: string
  staticRawToken: string
}

const USER_IDS = [SMOKE.USER_A_ID, SMOKE.USER_B_ID]

// Deletes every fixture row. Repositories cascade to branches, documents, chunks,
// mcp_tokens and group_repositories; deleting users cascades to their sessions.
export async function teardownFixtures(extraClientIds: string[] = []): Promise<void> {
  if (extraClientIds.length > 0) {
    await db.delete(oauthApplication).where(inArray(oauthApplication.clientId, extraClientIds))
  }
  await db.delete(mcpOauthToken).where(inArray(mcpOauthToken.userId, USER_IDS))
  await db
    .delete(mcpOauthAuthorizationCode)
    .where(inArray(mcpOauthAuthorizationCode.userId, USER_IDS))
  await db.delete(repositories).where(eq(repositories.id, SMOKE.REPO_ID))
  await db.delete(session).where(inArray(session.userId, USER_IDS))
  await db.delete(user).where(inArray(user.id, USER_IDS))
  await db.delete(groups).where(eq(groups.id, SMOKE.GROUP_ID))
}

export async function seedFixtures(): Promise<SeedHandles> {
  await teardownFixtures() // clean slate → idempotent re-runs
  const now = new Date()

  await db.insert(groups).values({ id: SMOKE.GROUP_ID, name: SMOKE.GROUP_ID })

  await db.insert(user).values([
    {
      id: SMOKE.USER_A_ID,
      name: 'Smoke MCP A',
      email: SMOKE_EMAIL_A,
      emailVerified: true,
      role: 'user',
      groupId: SMOKE.GROUP_ID,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: SMOKE.USER_B_ID,
      name: 'Smoke MCP B',
      email: SMOKE_EMAIL_B,
      emailVerified: true,
      role: 'user',
      groupId: null,
      createdAt: now,
      updatedAt: now,
    },
  ])

  await db.insert(repositories).values({
    id: SMOKE.REPO_ID,
    userId: SMOKE.USER_A_ID,
    name: 'smoke-mcp-fixture',
    cloneUrl: SMOKE_CLONE_URL,
    provider: 'github',
    defaultBranch: 'main',
    status: 'done',
  })

  await db.insert(branches).values({
    id: SMOKE.BRANCH_ID,
    repositoryId: SMOKE.REPO_ID,
    name: 'main',
    lastIndexedAt: now,
  })

  await db.insert(documents).values({
    id: SMOKE.DOC_ID,
    branchId: SMOKE.BRANCH_ID,
    path: SMOKE.DOC_PATH,
    content: SMOKE.DOC_CONTENT,
    programmingLanguage: 'markdown',
  })

  await db.insert(groupRepositories).values({
    groupId: SMOKE.GROUP_ID,
    repositoryId: SMOKE.REPO_ID,
  })

  const secret = createMcpTokenSecret()
  await db.insert(mcpTokens).values({
    repositoryId: SMOKE.REPO_ID,
    userId: SMOKE.USER_A_ID,
    tokenHash: secret.tokenHash,
    fingerprint: secret.fingerprint,
    label: SMOKE.STATIC_TOKEN_LABEL,
    expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
  })

  return {
    userA: { id: SMOKE.USER_A_ID, email: SMOKE_EMAIL_A },
    userB: { id: SMOKE.USER_B_ID, email: SMOKE_EMAIL_B },
    repoId: SMOKE.REPO_ID,
    docPath: SMOKE.DOC_PATH,
    staticRawToken: secret.rawToken,
  }
}

// Mints a valid session for a seeded user and returns the signed Cookie value,
// bypassing /sign-in/email entirely (SSO-agnostic). Uses better-auth's own
// makeSignature so the cookie verifies exactly as a real login's would; the cookie
// name carries the __Secure- prefix iff the api runs with secure cookies (production).
export async function mintSession(userId: string): Promise<string> {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set; cannot mint a session cookie.')
  const token = randomBytes(32).toString('hex')
  const now = new Date()
  await db.insert(session).values({
    id: randomBytes(16).toString('hex'),
    token,
    userId,
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
  })
  // Mirror better-call's signCookieValue (encodeURIComponent of `${token}.${sig}`),
  // and emit under both cookie names so the cookie matches the api whether secure
  // cookies are on (NODE_ENV=production → __Secure- prefix) or off — the api reads
  // its configured name and ignores the other.
  const signed = encodeURIComponent(`${token}.${await makeSignature(token, secret)}`)
  return `better-auth.session_token=${signed}; __Secure-better-auth.session_token=${signed}`
}

// CLI: tsx seed.ts [--seed | --teardown | --verify]
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? '--verify'
  assertLocalDatabase(process.env.DATABASE_URL)
  if (mode === '--teardown') {
    await teardownFixtures()
    console.log('teardown ok')
  } else {
    const handles = await seedFixtures()
    console.log('seeded:', handles.repoId, handles.userA.email, handles.userB.email)
    if (mode === '--verify') {
      const [repo] = await db.select().from(repositories).where(eq(repositories.id, SMOKE.REPO_ID))
      const [doc] = await db.select().from(documents).where(eq(documents.id, SMOKE.DOC_ID))
      if (!repo || !doc) throw new Error('verify failed: fixtures not found after seed')
      await teardownFixtures()
      const [gone] = await db.select().from(repositories).where(eq(repositories.id, SMOKE.REPO_ID))
      if (gone) throw new Error('verify failed: teardown left the repository')
      console.log('verify ok')
    }
  }
  process.exit(0)
}
