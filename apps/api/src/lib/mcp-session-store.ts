export type CloseableTransport = {
  close?: () => Promise<void> | void
  sessionId?: string
}

export type McpSessionRecord<TTransport extends CloseableTransport> = {
  id: string
  transport: TTransport
  principalKey: string
  createdAt: number
  lastSeenAt: number
}

type SessionInput<TTransport extends CloseableTransport> = {
  transport: TTransport
  principalKey: string
}

type McpSessionStoreOptions = {
  ttlMs: number
  maxSessions: number
  now?: () => number
}

export type McpSessionStoreConfig = {
  ttlMs: number
  sweepIntervalMs: number
  maxSessions: number
}

type McpSessionLifecycleOptions<TTransport extends CloseableTransport> = {
  sessions: Pick<McpSessionStore<TTransport>, 'set' | 'delete'>
  principalKey: string
  getTransport: () => TTransport
  closeEvictedSessions: (
    records: McpSessionRecord<TTransport>[],
    reason: 'max-sessions',
  ) => Promise<void> | void
}

const DEFAULT_TTL_MS = 30 * 60 * 1000
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 1000
const DEFAULT_MAX_SESSIONS = 200

function positiveIntegerEnv(env: NodeJS.ProcessEnv, name: string, fallback: number) {
  const raw = env[name]
  if (raw === undefined || raw === '') return fallback

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || String(parsed) !== raw.trim()) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

export function parseMcpSessionStoreConfig(env: NodeJS.ProcessEnv): McpSessionStoreConfig {
  return {
    ttlMs: positiveIntegerEnv(env, 'MCP_SESSION_TTL_MS', DEFAULT_TTL_MS),
    sweepIntervalMs: positiveIntegerEnv(
      env,
      'MCP_SESSION_SWEEP_INTERVAL_MS',
      DEFAULT_SWEEP_INTERVAL_MS,
    ),
    maxSessions: positiveIntegerEnv(env, 'MCP_MAX_SESSIONS', DEFAULT_MAX_SESSIONS),
  }
}

export function createMcpSessionLifecycleHandlers<TTransport extends CloseableTransport>({
  sessions,
  principalKey,
  getTransport,
  closeEvictedSessions,
}: McpSessionLifecycleOptions<TTransport>) {
  return {
    onsessioninitialized: (sessionId: string) => {
      const evicted = sessions.set(sessionId, { transport: getTransport(), principalKey })
      void closeEvictedSessions(evicted, 'max-sessions')
    },
    onsessionclosed: (sessionId: string) => {
      sessions.delete(sessionId)
    },
    onclose: () => {
      const sessionId = getTransport().sessionId
      if (sessionId) sessions.delete(sessionId)
    },
  }
}

export class McpSessionStore<TTransport extends CloseableTransport> {
  private readonly sessions = new Map<string, McpSessionRecord<TTransport>>()
  private readonly ttlMs: number
  private readonly maxSessions: number
  private readonly now: () => number

  constructor(options: McpSessionStoreOptions) {
    this.ttlMs = options.ttlMs
    this.maxSessions = options.maxSessions
    this.now = options.now ?? Date.now
  }

  get size() {
    return this.sessions.size
  }

  set(id: string, input: SessionInput<TTransport>): McpSessionRecord<TTransport>[] {
    const now = this.now()
    this.sessions.set(id, {
      id,
      transport: input.transport,
      principalKey: input.principalKey,
      createdAt: now,
      lastSeenAt: now,
    })
    return this.evictOverflow()
  }

  get(id: string, principalKey: string): McpSessionRecord<TTransport> | undefined {
    const session = this.sessions.get(id)
    if (!session || session.principalKey !== principalKey) return undefined

    session.lastSeenAt = this.now()
    return session
  }

  delete(id: string) {
    return this.sessions.delete(id)
  }

  sweepExpired(now = this.now()): McpSessionRecord<TTransport>[] {
    const expired: McpSessionRecord<TTransport>[] = []
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastSeenAt > this.ttlMs) {
        this.sessions.delete(id)
        expired.push(session)
      }
    }
    return expired
  }

  private evictOverflow(): McpSessionRecord<TTransport>[] {
    const evicted: McpSessionRecord<TTransport>[] = []
    while (this.sessions.size > this.maxSessions) {
      let oldest: McpSessionRecord<TTransport> | undefined
      for (const session of this.sessions.values()) {
        if (!oldest || session.lastSeenAt < oldest.lastSeenAt) {
          oldest = session
        }
      }
      if (!oldest) break
      this.sessions.delete(oldest.id)
      evicted.push(oldest)
    }
    return evicted
  }
}
