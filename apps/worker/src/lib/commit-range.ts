/**
 * A resolved git commit is a 7–40 char hex SHA. The current incremental
 * scheduler only ever enqueues resolved SHAs (`indexedCommitSha` and the
 * `ls-remote` head). Relative refs like `HEAD~1` only appear in orphaned jobs
 * from earlier scheduler designs, which can never run successfully.
 */
const SHA_LIKE = /^[0-9a-f]{7,40}$/i

export function isShaLike(value: string): boolean {
  return SHA_LIKE.test(value)
}
