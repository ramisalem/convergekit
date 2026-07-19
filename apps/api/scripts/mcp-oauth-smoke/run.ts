import {
  type Ctx,
  case1,
  case2,
  case3,
  case4,
  case5,
  case6,
  case7,
  case8,
  case9,
  case10,
  case11,
} from './cases.js'
import { assertLocalDatabase } from './guard.js'
import * as oc from './oauth-client.js'
import { mintSession, seedFixtures, teardownFixtures } from './seed.js'

let pass = 0
let fail = 0
const registeredClientIds: string[] = []

function ok(name: string): void {
  console.log(`  \x1b[32mPASS\x1b[0m ${name}`)
  pass++
}
function bad(name: string, err: unknown): void {
  console.log(`  \x1b[31mFAIL\x1b[0m ${name} — ${(err as Error).message}`)
  fail++
}
async function runCase(name: string, fn: (ctx: Ctx) => Promise<void>, ctx: Ctx): Promise<void> {
  try {
    await fn(ctx)
    ok(name)
  } catch (err) {
    bad(name, err)
  }
}

async function main(): Promise<void> {
  assertLocalDatabase(process.env.DATABASE_URL)

  // Probe the API-served shadow doc (mounted on authRoutes), not the apex path
  // which may only resolve via Caddy — proves the running api has OAuth enabled.
  const disco = await fetch(`${oc.BASE_URL}/api/auth/.well-known/oauth-authorization-server`)
  if (disco.status !== 200) {
    throw new Error(
      `MCP OAuth appears disabled (discovery ${disco.status} at ${oc.BASE_URL}). ` +
        'Start the stack with MCP_OAUTH_ENABLED=true and restart the api.',
    )
  }

  const seed = await seedFixtures()
  try {
    const ctx: Ctx = {
      cookieA: await mintSession(seed.userA.id),
      cookieB: await mintSession(seed.userB.id),
      seed,
      newClient: async () => {
        const id = await oc.dcr(['http://localhost:9876/callback'])
        registeredClientIds.push(id)
        return id
      },
    }

    // Preflight: prove the minted session cookie is actually accepted by the running
    // api before running cases. The most common host-run misconfig is a
    // BETTER_AUTH_SECRET mismatch (host vs api) or pointing at a different DB — both
    // would otherwise surface as every authenticated case failing with a confusing
    // "authorize did not redirect". Fail fast with one clear message instead.
    const preflight = await oc.connectedAgentsStatus(ctx.cookieA)
    if (preflight !== 200) {
      throw new Error(
        `Minted session was rejected by the api (GET /api/me/connected-agents -> ${preflight}). ` +
          'Ensure BETTER_AUTH_SECRET matches the running api and that DATABASE_URL / SMOKE_BASE_URL ' +
          'point at the same local stack.',
      )
    }

    await runCase('1  happy path', case1, ctx)
    await runCase('2  single-use authorization code', case2, ctx)
    await runCase('3  PKCE verifier mismatch', case3, ctx)
    await runCase('4  redirect_uri allowlist', case4, ctx)
    await runCase('5  consent deny', case5, ctx)
    await runCase('6  scope filtering', case6, ctx)
    await runCase('7  refresh reuse -> family revoke', case7, ctx)
    await runCase('8  disconnect -> 401', case8, ctx)
    await runCase('9  static escape hatch', case9, ctx)
    await runCase('10 real tool call', case10, ctx)
    await runCase('11 cross-user no-leak', case11, ctx)
  } finally {
    await teardownFixtures(registeredClientIds)
  }

  console.log(`\n\x1b[1mSummary:\x1b[0m ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('smoke crashed:', err)
  process.exit(1)
})
