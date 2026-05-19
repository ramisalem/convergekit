# MCP Deployment Options and Marketplace Distribution

This document captures the MCP security and deployment analysis discussed during the April 2026 rollout work, refined with one hard requirement:

ConvergeKit MCP must be distributable through official registries, community marketplaces, and client-specific extension/plugin channels.

That changes the strategy. We cannot think of MCP only as a private URL plus a copied token. We need a public discovery and installation surface while keeping repository data private, authenticated, scoped, audited, and revocable.

---

## 1. Core Requirement

ConvergeKit MCP must be available through these channels:

1. Official and core registries:
   - Official MCP Registry.
   - Microsoft Learn / MCP publishing guidance and, later, Microsoft certification if we target Microsoft 365 Copilot surfaces.
2. High-traffic community marketplaces:
   - Smithery.
   - MCP Market.
   - MCP.Directory.
   - mcp.so.
3. Platform-specific extension lists:
   - Claude Desktop Extensions using `.mcpb`.
   - Codex Plugin Marketplace using `.codex-plugin/plugin.json` and `.mcp.json`.

The distribution artifact must be public enough for marketplaces to index and verify. The repository content exposed by the MCP tools must remain private and protected by ConvergeKit authorization.

### Key Principle

Publish the MCP server, not the user's access.

Registry entries, packages, bundles, and plugins should describe how to install or connect to ConvergeKit MCP. They must not contain user-specific repository tokens. Users authenticate during setup or first use.

---

## 2. Product Shape

The public MCP offering should be a single, branded server:

- Name: `ConvergeKit`
- Suggested registry name: `example-org/convergekit`
- Public remote endpoint: `https://convergekit.example.com/api/mcp`
- Transport: `streamable-http`
- Tools:
  - `get_structure`
  - `search_docs`
  - `read_file`
- Authentication:
  - Phase 1: repository-scoped bearer token from ConvergeKit.
  - Phase 2: ConvergeKit-issued OAuth/OIDC-compatible MCP authorization and short-lived MCP access tokens.

Per-repository names such as `example-backend-convergekit` are still useful inside generated client config because they help users and agents pick the right server. Marketplace and registry identity should stay stable and product-level.

Workforce SSO and MCP authorization are separate trust boundaries. ConvergeKit-hosted workforce login can use Google Workspace SAML, while MCP clients should receive ConvergeKit-issued MCP credentials. MCP clients must not receive Google SAML assertions or Google Workspace credentials.

---

## 3. Distribution Architecture

The deployment model should have three layers.

### Layer 1: Public Discovery Metadata

This is what registries and marketplaces index:

- `.mcp/server.json` for the Official MCP Registry.
- Public README with installation instructions.
- Privacy policy, terms, support contact, and security notes.
- Icons, screenshots, categories, keywords, example prompts, and tool descriptions.
- Marketplace-specific metadata where required.

This layer contains no secrets and no customer repository data.

### Layer 2: Installable Client Adapters

Different clients expect different packaging:

- Remote MCP registry entry for clients that can connect directly to `streamable-http`.
- npm package or local bridge for clients that need a stdio command.
- `.mcpb` bundle for Claude Desktop one-click installation.
- Codex plugin with `.codex-plugin/plugin.json` and `.mcp.json`.

Adapters should be thin. Their job is to collect configuration, hold local client settings, and forward MCP traffic to the remote ConvergeKit MCP API.

### Layer 3: Authenticated ConvergeKit MCP API

This is the production MCP endpoint:

- Validates credentials on every request.
- Enforces repository access at runtime.
- Registers only the tools allowed by the token or OAuth grant.
- Audits request metadata and tool calls.
- Updates last-used metadata.
- Applies rate limits.
- Rejects expired, revoked, deactivated-user, deleted-repository, and lost-access credentials.

This layer remains the final authority even if a gateway, registry, package, or marketplace is used.

---

## 4. Registry-Friendly Server Metadata

The Official MCP Registry supports remote servers through the `remotes` property in `server.json`. A registry-friendly remote definition should look like this conceptually:

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "example-org/convergekit",
  "title": "ConvergeKit",
  "description": "Search and read repository knowledge from ConvergeKit.",
  "version": "1.0.0",
  "websiteUrl": "https://convergekit.example.com",
  "repository": {
    "url": "https://github.com/example-org/convergekit",
    "source": "github"
  },
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://convergekit.example.com/api/mcp",
      "headers": [
        {
          "name": "Authorization",
          "description": "Bearer token from ConvergeKit repository settings.",
          "isRequired": true,
          "isSecret": true
        }
      ]
    }
  ]
}
```

Notes:

- The exact namespace should match whatever we can verify through DNS or HTTP ownership. If `example.com` is verified, `example-org/convergekit` is the preferred stable name.
- Registry metadata is product-level. Per-repository identity remains in generated client configuration and token labels.
- The registry entry should not embed a token. It should declare the required secret header.
- When we ship an npm bridge or MCPB, `packages` can coexist with `remotes` so host applications can choose the best install method.

---

## 5. Refined Deployment Options

### Option A: Public Remote MCP With Hardened Repository Tokens

Publish the ConvergeKit MCP server as a public remote MCP endpoint in registries and marketplaces. Users create a repository-scoped token in ConvergeKit and provide it as the `Authorization` secret during setup.

**Distribution coverage**

- Official MCP Registry: yes, through `server.json` `remotes`.
- Community marketplaces: yes, using the same public endpoint and metadata.
- Claude Desktop: works through generated `mcp-remote` config; can be improved with MCPB.
- Cursor: works through direct `mcp.json` remote config.
- Codex: works through direct MCP config or a plugin package.

**Security controls**

- Expiry.
- Rotation.
- Fingerprints.
- Tool scopes.
- Runtime repository access checks.
- Audit events.
- Rate limits.
- Automatic revocation on access changes.
- Suspicious-use alerts.

**Strengths**

- Fastest path to registry and marketplace availability.
- Matches the hard distribution requirement without new identity infrastructure.
- Easy for users to understand.
- Keeps all repository authorization inside ConvergeKit.

**Limitations**

- Users still manage a bearer token.
- Registry and marketplace flows depend on each client handling secret headers well.
- A copied token remains usable until expiry or revocation.

**Recommendation**

Use this as the immediate public distribution baseline.

---

### Option B: Local Bridge Package

Publish a small package, likely npm first, that runs locally over stdio and proxies to the hosted ConvergeKit MCP endpoint.

Example client shape:

```json
{
  "mcpServers": {
    "example-backend-convergekit": {
      "command": "npx",
      "args": [
        "-y",
        "@convergekit/mcp-bridge",
        "https://convergekit.example.com/api/mcp"
      ],
      "env": {
        "CONVERGEKIT_MCP_AUTH": "Bearer <token>"
      }
    }
  }
}
```

**Distribution coverage**

- Official MCP Registry: yes, through `packages` with `registryType: "npm"`.
- Community marketplaces: yes.
- Claude Desktop: yes, through a local stdio command.
- Cursor: yes.
- Codex: yes, through `.mcp.json`.

**Security controls**

- Same server-side controls as Option A.
- Local package should never log raw tokens.
- Local package should support environment variables and OS keychain later.

**Strengths**

- Works with clients that do not support authenticated remote HTTP cleanly.
- Gives us a stable command surface instead of relying on `mcp-remote@latest`.
- Makes one-click bundles easier to build.

**Limitations**

- Adds package publishing and maintenance.
- The local machine still stores a secret.
- The package must be kept small, auditable, and boring.

**Recommendation**

Build this soon after the remote registry listing. It becomes the compatibility layer for Claude Desktop, Codex, and any client that prefers stdio.

---

### Option C: Claude Desktop Extension (`.mcpb`)

Package the local bridge as a Claude Desktop Extension using the MCPB format. The bundle should install a stdio adapter and present a settings UI for:

- ConvergeKit base URL.
- Repository MCP token or OAuth login state.
- Optional server display name.

**Distribution coverage**

- Claude Desktop Extensions: yes.
- Official MCP Registry: possible as an MCPB package type or via remote listing plus directory submission.
- Community marketplaces: useful as a downloadable install path.

**Security controls**

- Use `user_config` sensitive fields for the token.
- Do not bundle user credentials.
- Server-side token scopes and revocation remain mandatory.

**Strengths**

- Best Claude Desktop user experience.
- One-click installation reduces setup errors.
- Can include icons, permissions, and a clear install review flow.

**Limitations**

- MCPB is local and stdio-oriented.
- Each user installs separately.
- Requires bundle build, signing/release discipline, and platform testing on macOS and Windows.

**Recommendation**

Make MCPB the polished Claude Desktop distribution path, but keep the remote registry entry as the canonical discovery path.

---

### Option D: Codex Plugin Package

Ship a Codex plugin with:

- `.codex-plugin/plugin.json`
- `.mcp.json`
- Optional skills that teach Codex when and how to use ConvergeKit MCP.
- Assets and marketplace metadata.

The plugin should configure the MCP server and include short usage guidance, but the actual credential should still come from user setup.

**Distribution coverage**

- Codex Plugin Marketplace: yes.
- Codex local installs: yes.
- Official MCP Registry: separate `server.json` still needed.

**Security controls**

- Plugin must not include a raw token.
- `.mcp.json` should reference environment variables or install-time auth inputs.
- Server-side runtime auth remains mandatory.

**Strengths**

- Codex can understand when to use ConvergeKit through packaged instructions.
- Plugin metadata improves discovery and installation.
- Good place to ship starter prompts and repository-knowledge workflows.

**Limitations**

- Codex plugin marketplace requirements are evolving.
- This does not replace MCP registry publishing.
- We need to keep plugin guidance aligned with actual tool names and scopes.

**Recommendation**

Treat this as a first-class distribution artifact for coding-agent users. Version it alongside the MCP server.

---

### Option E: ConvergeKit OAuth/OIDC Remote Connector

Move from long-lived repository tokens to a browser-based OAuth/OIDC-compatible flow where users authorize the MCP client and receive short-lived ConvergeKit MCP credentials.

This OAuth layer is downstream from human workforce sign-in. A user may authenticate to ConvergeKit through Google Workspace SAML, GitHub admin login, or another approved human login path, but the MCP client receives only ConvergeKit-issued MCP access and refresh tokens.

**Distribution coverage**

- Official MCP Registry: stronger, especially for public remote listings.
- Community marketplaces: stronger setup story.
- Microsoft certification: much better fit, because OAuth 2.0 is the preferred authentication method for certified MCP servers.
- Claude/Codex/Cursor: depends on client support or a local bridge that can complete the OAuth flow.

**Security controls**

- Short-lived access tokens.
- Refresh-token rotation.
- Consent and re-authentication.
- Central revocation.
- User/session linkage.
- Repository and tool scopes in the ConvergeKit grant.
- Runtime repository authorization remains in ConvergeKit.

**Strengths**

- Better than static bearer tokens for broad marketplace distribution.
- Reduces secret-copying UX.
- Better fit for enterprise security review.

**Limitations**

- More implementation work.
- Desktop-client OAuth callback behavior varies.
- Local adapters may still need to store refresh material securely.

**Recommendation**

Plan this as Phase 2. Public marketplace distribution can begin with hardened tokens, but ConvergeKit OAuth/OIDC-compatible MCP authorization should become the target for broad adoption and Microsoft/Copilot certification.

---

### Option F: MCP Gateway or ToolHive-Style Platform

Place a gateway between MCP clients and the ConvergeKit MCP API. The gateway handles identity, coarse policy, routing, observability, and potentially token exchange.

**Distribution coverage**

- Official MCP Registry: yes, registry points at the gateway URL.
- Community marketplaces: yes.
- Enterprise/private deployments: strong.
- ToolHive-style deployments: strong for organizations that want central MCP governance.

**Security controls**

- Central authentication.
- Central authorization policy.
- Tool-level allow/deny.
- Request shaping.
- Rate limiting.
- Cross-MCP audit.
- Possible short-lived internal credential exchange.

**Strengths**

- Best governance model if ConvergeKit operates many MCP servers.
- Lets us standardize policy outside individual services.
- Can support enterprise controls without complicating the core app.

**Limitations**

- More infrastructure.
- More operational ownership.
- Risk of duplicated policy if not designed carefully.

**Recommendation**

Evaluate after the registry/token baseline is live. Keep app-level authorization as the final backstop even if a gateway exists.

---

### Option G: Private Registry for Enterprise Deployments

For customers that cannot expose MCP endpoints publicly, use a private registry that follows the MCP Registry API shape and lists customer-private MCP servers.

**Distribution coverage**

- Official public MCP Registry: no, because private-only servers are not supported there.
- Private enterprise marketplace: yes.
- Internal Claude/Codex/Cursor configuration: yes.

**Security controls**

- Customer network controls.
- Customer SSO.
- App-level repository authorization.
- Optional gateway.

**Strengths**

- Works for air-gapped or internal-only customers.
- Aligns with enterprise network boundaries.

**Limitations**

- Does not satisfy public marketplace discoverability.
- Customer-specific operations and support burden.

**Recommendation**

Offer as enterprise deployment mode only. Do not make it the primary public distribution strategy.

---

### Option H: Private Network or mTLS Add-On

Restrict access with VPN, zero-trust network access, or client certificates.

**Distribution coverage**

- Official public registry: poor fit unless the server is also publicly accessible.
- Enterprise private deployments: strong.

**Security controls**

- Network-level access restriction.
- Device trust or certificate binding.
- Defense-in-depth against simple token replay.

**Strengths**

- Useful for strict enterprise customers.
- Can reduce internet exposure for private deployments.

**Limitations**

- Not friendly for broad marketplace usage.
- Network access is not repository authorization.
- Still requires app-level token or OAuth checks.

**Recommendation**

Use only as an optional enterprise add-on.

---

## 6. Comparison Matrix

| Option | Registry/Marketplace Fit | Security | UX | Complexity | Recommendation |
|---|---:|---:|---:|---:|---|
| Public remote + hardened repo tokens | High | Medium | High | Low | Use now |
| Local bridge package | High | Medium | High | Medium | Build soon |
| Claude `.mcpb` | High for Claude | Medium | Very High | Medium | Build for Claude |
| Codex plugin | High for Codex | Medium | High | Medium | Build for Codex |
| OAuth/OIDC remote connector | High | High | High | High | Phase 2 target |
| Gateway / ToolHive-style platform | High | High | Medium-High | High | Evaluate later |
| Private registry | Low public, high enterprise | High | Medium | Medium-High | Enterprise mode |
| VPN/mTLS add-on | Low public, high enterprise | High | Low-Medium | High | Optional add-on |

---

## 7. Recommended Rollout Path

### Phase 1: Public Remote Listing With Hardened Tokens

Publish the hosted endpoint as a remote MCP server:

- Create `.mcp/server.json`.
- Verify `example.com` namespace ownership.
- Publish to the Official MCP Registry with `mcp-publisher`.
- Submit to community marketplaces.
- Keep generated in-app configs for Claude Desktop and Cursor.
- Document token creation, scopes, expiry, renewal, and revocation.

This phase uses the hardened token system already deployed.

### Phase 1.5: Compatibility Adapters

Ship installable artifacts that make setup easier:

- npm package bridge, for example `@convergekit/mcp-bridge`.
- Claude Desktop `.mcpb` bundle.
- Codex plugin package.

These artifacts should all point to the same hosted MCP API and should not duplicate authorization logic.

### Phase 2: ConvergeKit OAuth/OIDC Setup

Introduce browser-based MCP authorization:

- Users install from registry or marketplace.
- Client or local bridge starts a ConvergeKit OAuth/OIDC-compatible flow.
- ConvergeKit uses the existing human session, which may have been created through Google Workspace SAML, as the consent context.
- ConvergeKit issues short-lived MCP access tokens.
- Repository selection and scopes are represented in the grant.
- Runtime access checks continue on every request.

This is the preferred direction for public marketplace maturity and Microsoft/Copilot certification.

### Phase 3: Gateway Evaluation

Evaluate a gateway or ToolHive-style deployment if we need:

- Central governance for multiple MCP servers.
- Cross-server policy.
- Enterprise audit and approvals.
- Token exchange at the edge.
- Organization-level MCP catalogs.

---

## 8. Publishing Checklist

### Official MCP Registry

- [ ] Choose stable server name, preferably `example-org/convergekit`.
- [ ] Verify namespace using DNS, HTTP, GitHub OAuth, or GitHub OIDC.
- [ ] Add `.mcp/server.json`.
- [ ] Include `remotes` with `type: "streamable-http"` and `url: "https://convergekit.example.com/api/mcp"`.
- [ ] Declare `Authorization` as a required secret header for Phase 1.
- [ ] Add package entries when the npm bridge or MCPB is available.
- [ ] Add CI publishing through `mcp-publisher` once the process is stable.

### Community Marketplaces

- [ ] Create one public landing page for ConvergeKit MCP.
- [ ] Add README installation instructions for Claude Desktop, Cursor, Codex, and generic MCP clients.
- [ ] Provide icons, screenshots, categories, tags, and starter prompts.
- [ ] Submit to Smithery, MCP Market, MCP.Directory, and mcp.so.
- [ ] Keep listings consistent with the Official MCP Registry metadata.
- [ ] Monitor listings for stale installation instructions.

### Claude Desktop Extensions

- [ ] Build an MCPB around the local bridge.
- [ ] Add `manifest.json` with required metadata, supported platforms, tools, and user configuration.
- [ ] Mark token/auth fields as sensitive.
- [ ] Include 512x512 icon assets.
- [ ] Test on macOS and Windows.
- [ ] Submit to the Claude Connectors Directory when ready.

### Codex Plugin

- [ ] Add `.codex-plugin/plugin.json`.
- [ ] Add `.mcp.json` pointing to the bridge or hosted MCP endpoint.
- [ ] Include plugin metadata, screenshots, logo, category, and starter prompts.
- [ ] Add a small skill or instruction file telling Codex when to use ConvergeKit MCP.
- [ ] Keep raw tokens out of plugin files.
- [ ] Package and submit to the Codex plugin marketplace when the public submission path is available.

### Microsoft / Copilot

- [ ] Treat Microsoft certification as a separate enterprise channel.
- [ ] Prefer OAuth 2.0 before submission.
- [ ] Prepare OpenAPI/connector artifacts if required by the certification process.
- [ ] Provide intro documentation, test credentials, telemetry evidence, and tool-level test coverage.
- [ ] Expect manual security, compliance, and responsible AI review.

---

## 9. Security Requirements Across All Channels

Regardless of distribution channel, the app must enforce:

- Repository-scoped authorization.
- Tool-scope enforcement.
- Runtime access checks on every MCP request.
- Expiry and revocation.
- User deactivation handling.
- Deleted repository handling.
- Audit events.
- Rate limits.
- Last-used metadata.
- Admin revoke-all.
- Suspicious-use alerts.

Public distribution increases the importance of these controls. Marketplace availability makes the MCP endpoint easier to find, so the server must assume hostile traffic and invalid tokens are normal.

---

## 10. UX Requirements Across All Channels

### End Users

- Installation should not require understanding MCP internals.
- Generated config should match the selected client.
- Server names in local config should include the repository name, such as `example-backend-convergekit`.
- Tokens should be shown once and then replaced by fingerprints.
- Expiry, scopes, status, and last-used metadata should be visible.
- Revoked and expired tokens must fail test/auth checks.
- Test output should separate endpoint, authentication, and tool-listing failures.
- Renewal should clearly revoke the old token and return the new token once.

### Admins

- Admins should see token owner identity.
- Admins should filter tokens by user.
- Admins should revoke one token or all tokens for a user.
- Admins should see audit and alert history.
- Admins should see deactivated users clearly.
- Admins should see which distribution/client label a token is used for.

### Marketplace Reviewers

- Provide a test repository and test credentials with limited data.
- Provide example prompts that exercise all three tools.
- Document known limitations.
- Document data handling and privacy.
- Document support and incident response.

---

## 11. What Not To Do

- Do not publish user-specific tokens in registry metadata, bundles, plugins, screenshots, or docs.
- Do not rely on indefinite bearer tokens.
- Do not make private-network-only deployment the public marketplace strategy.
- Do not remove application-level repository checks just because a registry, plugin, or gateway exists.
- Do not expose all MCP tools when a credential only has one scope.
- Do not physically delete normal revoked tokens if audit history matters.
- Do not make generated local server names generic when tokens are repository-specific.
- Do not let adapters grow into separate authorization implementations.

---

## 12. Current Recommendation

Use a dual-track strategy:

1. Public distribution now:
   - Official MCP Registry remote entry.
   - Community marketplace listings.
   - Claude/Cursor/Codex setup docs.
   - Hardened repository tokens as the initial auth model.
2. Better installation and auth next:
   - npm bridge.
   - Claude MCPB.
   - Codex plugin.
   - OAuth/OIDC token exchange.

This satisfies marketplace discoverability without weakening repository security. The public artifacts make ConvergeKit easy to find and install; the ConvergeKit API remains responsible for every authorization decision.

---

## References

- Official MCP Registry overview: https://modelcontextprotocol.io/registry/about
- Official MCP Registry quickstart: https://modelcontextprotocol.io/registry/quickstart
- Official MCP Registry remote server publishing: https://modelcontextprotocol.io/registry/remote-servers
- Official MCP Registry package types: https://modelcontextprotocol.io/registry/package-types
- Official MCP Registry authentication: https://modelcontextprotocol.io/registry/authentication
- Microsoft Learn MCP Registry publishing guide: https://learn.microsoft.com/en-us/dotnet/ai/quickstarts/publish-mcp-registry
- Microsoft MCP server certification: https://learn.microsoft.com/en-us/microsoft-agent-365/mcp-certification
- Claude MCPB documentation: https://claude.com/docs/connectors/building/mcpb
- OpenAI Docs MCP configuration examples for Codex, VS Code, and Cursor: https://developers.openai.com/learn/docs-mcp
- ToolHive project overview: https://github.com/stacklok/toolhive
- Stacklok authorization for MCP servers: https://stacklok.com/blog/secure-by-default-authorization-for-mcp-servers-powered-by-toolhive/
