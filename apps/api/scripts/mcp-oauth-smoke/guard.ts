// Prod-write safety: the smoke suite seeds/deletes rows, so it must only ever
// touch a local database. Parse DATABASE_URL and allow only local hosts. The
// suite runs on the host (not inside the api container), so the DB must be
// reachable via a loopback host — the container-only `postgres` DNS name is
// intentionally NOT allowed here (it passes a naive check but can't connect).
const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

export function parseDbHost(databaseUrl: string): string {
  // WHATWG URL returns IPv6 hosts wrapped in brackets (e.g. "[::1]"); strip them
  // so the loopback check matches the bare address.
  return new URL(databaseUrl).hostname.toLowerCase().replace(/^\[|\]$/g, '')
}

export function assertLocalDatabase(databaseUrl: string | undefined): void {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set; refusing to run the MCP OAuth smoke seed.')
  }
  let host: string
  try {
    host = parseDbHost(databaseUrl)
  } catch {
    throw new Error('DATABASE_URL is not a valid URL; refusing to run the MCP OAuth smoke seed.')
  }
  if (!LOCAL_DB_HOSTS.has(host)) {
    throw new Error(
      `Refusing to seed: DATABASE_URL host "${host}" is not local. ` +
        'This suite writes fixtures and must run only against a local stack.',
    )
  }
}
