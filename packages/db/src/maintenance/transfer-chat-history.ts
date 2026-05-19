import { pathToFileURL } from 'node:url'

import postgres from 'postgres'

export type TransferChatHistoryArgs = {
  apply: boolean
  fromEmail: string
  toEmail: string
}

type UserRow = {
  id: string
  email: string
  name: string
  role: string
  group_id: string | null
  group_name: string | null
  deactivated_at: Date | null
  created_at: Date
  providers: string[]
}

type QueryClient = <T extends readonly Record<string, unknown>[] = Record<string, unknown>[]>(
  strings: TemplateStringsArray,
  ...parameters: unknown[]
) => Promise<T>

function normalizeEmail(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function getFlagValue(args: string[], index: number, flag: string): { value: string; nextIndex: number } {
  const current = args[index]
  if (current.startsWith(`${flag}=`)) {
    return { value: current.slice(flag.length + 1), nextIndex: index }
  }

  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`)
  }
  return { value, nextIndex: index + 1 }
}

export function parseTransferChatHistoryArgs(args: string[]): TransferChatHistoryArgs {
  let fromEmail = ''
  let toEmail = ''
  let confirm = ''
  let apply = false

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--apply') {
      apply = true
      continue
    }
    if (arg === '--from-email' || arg.startsWith('--from-email=')) {
      const parsed = getFlagValue(args, index, '--from-email')
      fromEmail = normalizeEmail(parsed.value)
      index = parsed.nextIndex
      continue
    }
    if (arg === '--to-email' || arg.startsWith('--to-email=')) {
      const parsed = getFlagValue(args, index, '--to-email')
      toEmail = normalizeEmail(parsed.value)
      index = parsed.nextIndex
      continue
    }
    if (arg === '--confirm' || arg.startsWith('--confirm=')) {
      const parsed = getFlagValue(args, index, '--confirm')
      confirm = parsed.value.trim()
      index = parsed.nextIndex
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!fromEmail) throw new Error('--from-email is required')
  if (!toEmail) throw new Error('--to-email is required')
  if (fromEmail === toEmail) throw new Error('--from-email and --to-email must be different')

  const expectedConfirmation = `${fromEmail}->${toEmail}`
  if (apply && confirm !== expectedConfirmation) {
    throw new Error(`Applying writes requires --confirm ${expectedConfirmation}`)
  }

  return { apply, fromEmail, toEmail }
}

async function getUserCounts(sql: QueryClient, email: string) {
  const [row] = await sql`
    select
      u.email,
      count(distinct cs.id)::int as chat_sessions,
      count(cm.id)::int as chat_messages,
      count(distinct cs.repository_id)::int as repositories
    from "user" u
    left join chat_sessions cs on cs.user_id = u.id
    left join chat_messages cm on cm.session_id = cs.id
    where lower(u.email) = ${email}
    group by u.email
  `

  return row ?? { email, chat_sessions: 0, chat_messages: 0, repositories: 0 }
}

async function loadTransferSnapshot(sql: QueryClient, fromEmail: string, toEmail: string) {
  const users = await sql<UserRow[]>`
    select
      u.id,
      u.email,
      u.name,
      u.role,
      u.group_id,
      g.name as group_name,
      u.deactivated_at,
      u.created_at,
      coalesce(
        array_agg(distinct a.provider_id) filter (where a.provider_id is not null),
        array[]::text[]
      ) as providers
    from "user" u
    left join groups g on g.id = u.group_id
    left join account a on a.user_id = u.id
    where lower(u.email) = ${fromEmail} or lower(u.email) = ${toEmail}
    group by u.id, u.email, u.name, u.role, u.group_id, g.name, u.deactivated_at, u.created_at
    order by u.email
  `
  const oldUser = users.find((u) => u.email.toLowerCase() === fromEmail)
  const newUser = users.find((u) => u.email.toLowerCase() === toEmail)

  const counts = await Promise.all([getUserCounts(sql, fromEmail), getUserCounts(sql, toEmail)])

  const oldUserChatByRepository = oldUser
    ? await sql`
        select
          r.id as repository_id,
          r.name as repository_name,
          count(distinct cs.id)::int as chat_sessions,
          count(cm.id)::int as chat_messages,
          max(cs.updated_at) as last_session_at
        from chat_sessions cs
        join repositories r on r.id = cs.repository_id
        left join chat_messages cm on cm.session_id = cs.id
        where cs.user_id = ${oldUser.id}
        group by r.id, r.name
        order by max(cs.updated_at) desc
      `
    : []

  const newUserAccessToOldChatRepositories = oldUser && newUser
    ? await sql`
        with old_repos as (
          select distinct repository_id from chat_sessions where user_id = ${oldUser.id}
        )
        select
          r.id as repository_id,
          r.name as repository_name,
          case
            when ${newUser.role} = 'admin' then true
            when gr.repository_id is not null then true
            else false
          end as new_user_has_access
        from old_repos o
        join repositories r on r.id = o.repository_id
        left join group_repositories gr
          on gr.repository_id = o.repository_id
         and gr.group_id = ${newUser.group_id}
        order by r.name
      `
    : []

  return {
    users,
    counts,
    oldUser,
    newUser,
    oldUserChatByRepository,
    newUserAccessToOldChatRepositories,
    blockers: [
      !oldUser ? `Old user not found: ${fromEmail}` : null,
      !newUser ? `New user not found: ${toEmail}` : null,
      newUser?.deactivated_at ? `New user is deactivated: ${toEmail}` : null,
    ].filter(Boolean),
  }
}

export async function runTransferChatHistory(args: TransferChatHistoryArgs) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')

  const db = postgres(process.env.DATABASE_URL, { max: 1 })
  try {
    return await db.begin(async (transactionSql) => {
      const sql = transactionSql as unknown as QueryClient
      const before = await loadTransferSnapshot(sql, args.fromEmail, args.toEmail)
      if (before.blockers.length > 0) {
        return { mode: args.apply ? 'apply' : 'preview', before, transferredSessionCount: 0 }
      }

      let transferredSessionCount = 0
      if (args.apply) {
        const updated = await sql`
          update chat_sessions
          set user_id = ${before.newUser!.id}
          where user_id = ${before.oldUser!.id}
          returning id
        `
        transferredSessionCount = updated.length
      }

      const after = await loadTransferSnapshot(sql, args.fromEmail, args.toEmail)
      return {
        mode: args.apply ? 'apply' : 'preview',
        transferredSessionCount,
        proposedTransfer: {
          fromEmail: args.fromEmail,
          fromUserId: before.oldUser!.id,
          toEmail: args.toEmail,
          toUserId: before.newUser!.id,
          sql: `update chat_sessions set user_id = '${before.newUser!.id}' where user_id = '${before.oldUser!.id}';`,
        },
        before,
        after,
      }
    })
  } finally {
    await db.end({ timeout: 5 })
  }
}

async function main() {
  try {
    const args = parseTransferChatHistoryArgs(process.argv.slice(2))
    const result = await runTransferChatHistory(args)
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    console.error(
      'Usage: pnpm --filter @convergekit/db db:transfer-chat-history -- --from-email old@example.com --to-email new@example.com [--apply --confirm old@example.com->new@example.com]',
    )
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}
