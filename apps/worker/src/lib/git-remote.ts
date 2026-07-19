// Import from the dedicated pure subpath, NOT the @convergekit/db barrel — the barrel
// loads the DB client (which requires DATABASE_URL at import), and this module
// is exercised by a unit test that runs without a database.
import { redactUrlCredentials } from '@convergekit/db/redact'
import { simpleGit } from 'simple-git'

export function parseLsRemoteHead(output: string, branchName: string): string | null {
  const wanted = `refs/heads/${branchName}`
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const [sha, ref] = line.split('\t')
    if (ref?.trim() === wanted && sha) return sha.trim()
  }
  return null
}

/**
 * Parse `git ls-remote --symref <url> HEAD` output, e.g.:
 *   ref: refs/heads/main\tHEAD
 *   <sha>\tHEAD
 * into the remote's default branch and its head sha.
 */
export function parseSymrefHead(output: string): { branch: string; sha: string } | null {
  let branch: string | null = null
  let sha: string | null = null
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('ref:')) {
      const match = line.match(/^ref:\s+refs\/heads\/(.+?)\s+HEAD$/)
      if (match) branch = match[1]
    } else {
      const [value, ref] = line.split('\t')
      if (ref?.trim() === 'HEAD' && value) sha = value.trim()
    }
  }
  return branch && sha ? { branch, sha } : null
}

export interface ResolvedRemoteHead {
  sha: string
  /**
   * The branch actually resolved: the requested name when present on the remote,
   * otherwise the remote's default branch (from its symbolic HEAD).
   */
  branch: string
}

type ListRemote = (args: string[]) => Promise<string>
const gitListRemote: ListRemote = (args) => simpleGit().listRemote(args)

async function runRedacted(run: () => Promise<string>): Promise<string> {
  try {
    return await run()
  } catch (err) {
    // simple-git embeds the credentialed clone URL in its error — redact it so
    // the token can never reach a log.
    throw new Error(redactUrlCredentials(err instanceof Error ? err.message : String(err)))
  }
}

/**
 * Resolve the head sha to diff against for an incremental check.
 *
 * Tries the stored branch name first. If the remote has no such branch — which
 * happens when `branches.name` is stale or was never the real default (e.g. a
 * repo stored as `main` whose actual default is `dev`/`openprose`) — fall back
 * to the remote's symbolic HEAD. That is the same default branch `git clone`
 * checks out, which is exactly what the full index recorded, so it is the
 * correct thing to track. The resolved branch is returned so callers can repair
 * a stale stored name. `runListRemote` is injectable for tests.
 *
 * `cloneUrl` may carry credentials; never log or return it.
 */
export async function resolveRemoteHead(
  cloneUrl: string,
  branchName: string,
  runListRemote: ListRemote = gitListRemote,
): Promise<ResolvedRemoteHead> {
  const headsOutput = await runRedacted(() => runListRemote(['--heads', cloneUrl, branchName]))
  const sha = parseLsRemoteHead(headsOutput, branchName)
  if (sha) return { sha, branch: branchName }

  const symrefOutput = await runRedacted(() => runListRemote(['--symref', cloneUrl, 'HEAD']))
  const head = parseSymrefHead(symrefOutput)
  if (head) return head

  throw new Error(`Remote branch ${branchName} not found and remote HEAD is unresolvable`)
}
