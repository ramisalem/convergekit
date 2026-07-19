/**
 * Redact userinfo (`user[:password]@`) from any URLs embedded in arbitrary
 * text, so credentialed clone URLs never reach logs or error surfaces.
 *
 * `simple-git`'s `GitError` embeds the full command — including authenticated
 * clone URLs like `https://x-oauth-token:<token>@github.com/...` — in both its
 * message and `task.commands`. Run error text through this before logging.
 */
export function redactUrlCredentials(text: string | null | undefined): string {
  if (!text) return ''
  return text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+(?::[^/\s@]+)?@/gi, '$1***@')
}
