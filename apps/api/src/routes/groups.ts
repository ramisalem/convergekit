import { db, groupRepositories, groups, repositories, user } from '@convergekit/db'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { NotFoundError } from '../errors.js'
import {
  revokeActiveMcpTokensForUsersAndRepository,
  revokeMcpTokensNoLongerAllowed,
} from '../lib/mcp-token-security.js'

export const groupRoutes = new Hono()

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
})

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
})

const assignRepoSchema = z.object({
  repositoryIds: z.array(z.string().uuid()).min(1),
})

// GET /api/groups — list all groups
groupRoutes.get('/', async (c) => {
  const allGroups = await db.select().from(groups)
  return c.json({ groups: allGroups })
})

// POST /api/groups — create a group
groupRoutes.post('/', async (c) => {
  const body = createGroupSchema.parse(await c.req.json())
  const [group] = await db
    .insert(groups)
    .values({ id: nanoid(), name: body.name, description: body.description ?? null })
    .returning()
  return c.json({ group }, 201)
})

// GET /api/groups/:id — get group with members and assigned repos
groupRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')

  const group = await db.query.groups.findFirst({
    where: eq(groups.id, id),
  })
  if (!group) throw new NotFoundError('Group')

  const members = await db
    .select({ id: user.id, name: user.name, email: user.email, image: user.image })
    .from(user)
    .where(eq(user.groupId, id))

  const assignedRepos = await db
    .select({
      repositoryId: groupRepositories.repositoryId,
      assignedAt: groupRepositories.assignedAt,
      name: repositories.name,
    })
    .from(groupRepositories)
    .innerJoin(repositories, eq(groupRepositories.repositoryId, repositories.id))
    .where(eq(groupRepositories.groupId, id))

  return c.json({ group, members, repositories: assignedRepos })
})

// PUT /api/groups/:id — update group
groupRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = updateGroupSchema.parse(await c.req.json())

  const [updated] = await db
    .update(groups)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(groups.id, id))
    .returning()

  if (!updated) throw new NotFoundError('Group')
  return c.json({ group: updated })
})

// DELETE /api/groups/:id — delete group
groupRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')

  const groupUsers = await db.select({ id: user.id }).from(user).where(eq(user.groupId, id))
  const userIds = groupUsers.map((u) => u.id)

  // Unassign users from this group before deleting
  await db.update(user).set({ groupId: null }).where(eq(user.groupId, id))
  await revokeMcpTokensNoLongerAllowed(userIds, 'group_deleted')

  const [deleted] = await db.delete(groups).where(eq(groups.id, id)).returning()
  if (!deleted) throw new NotFoundError('Group')

  return c.body(null, 204)
})

// POST /api/groups/:id/repositories — assign repos to group
groupRoutes.post('/:id/repositories', async (c) => {
  const groupId = c.req.param('id')
  const { repositoryIds } = assignRepoSchema.parse(await c.req.json())

  const group = await db.query.groups.findFirst({ where: eq(groups.id, groupId) })
  if (!group) throw new NotFoundError('Group')

  const values = repositoryIds.map((repositoryId) => ({ groupId, repositoryId }))
  await db.insert(groupRepositories).values(values).onConflictDoNothing()

  return c.json({ assigned: repositoryIds }, 201)
})

// DELETE /api/groups/:id/repositories/:repoId — unassign repo + revoke MCP tokens
groupRoutes.delete('/:id/repositories/:repoId', async (c) => {
  const groupId = c.req.param('id')
  const repoId = c.req.param('repoId')

  const [removed] = await db
    .delete(groupRepositories)
    .where(and(eq(groupRepositories.groupId, groupId), eq(groupRepositories.repositoryId, repoId)))
    .returning()

  if (!removed) throw new NotFoundError('Group-repository assignment')

  // Revoke MCP tokens for users in this group who had tokens for this repo
  const groupUsers = await db.select({ id: user.id }).from(user).where(eq(user.groupId, groupId))
  const userIds = groupUsers.map((u) => u.id)

  if (userIds.length > 0) {
    await revokeActiveMcpTokensForUsersAndRepository(userIds, repoId, 'group_repository_removed')
  }

  return c.body(null, 204)
})
