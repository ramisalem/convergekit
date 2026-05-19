import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function readDbSource(repoRootPath: string, packageRootPath: string) {
  const repoRootFile = join(process.cwd(), repoRootPath)
  const packageRootFile = join(process.cwd(), packageRootPath)

  return readFileSync(existsSync(repoRootFile) ? repoRootFile : packageRootFile, 'utf8')
}

describe('chat history query support', () => {
  it('tracks chat session titles and updated timestamps in the schema', () => {
    const source = readDbSource('packages/db/src/schema.ts', 'src/schema.ts')

    expect(source).toContain("title: text('title')")
    expect(source).toContain("updatedAt: timestamp('updated_at').defaultNow().notNull()")
  })

  it('exposes repository-scoped chat session helpers', () => {
    const source = readDbSource('packages/db/src/queries/index.ts', 'src/queries/index.ts')

    expect(source).toContain('export function deriveChatSessionTitle')
    expect(source).toContain('CHAT_SESSION_LIST_LIMIT = 30')
    expect(source).toContain('export function listChatSessions')
    expect(source).toContain('limit = CHAT_SESSION_LIST_LIMIT')
    expect(source).toContain('limit,')
    expect(source).toContain('export function getChatSession(')
    expect(source).toContain('export function getChatSessionWithMessages')
    expect(source).toContain('export async function deleteChatSession')
    expect(source).toContain('CHAT_MODEL_HISTORY_LIMIT = 20')
    expect(source).toContain('export async function getBoundedChatHistory')
    expect(source).toContain('.reverse()')
  })
})
