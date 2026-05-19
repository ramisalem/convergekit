# ConvergeKit Frontend Screen Definition

Date: 2026-05-09

This document is a frontend handoff for ConvergeKit. It defines what the product is, what each screen does, what components each screen should contain, and how the UI should behave across roles, loading states, errors, and repository lifecycle stages.

The document is based on the current codebase in `apps/web`, with supporting context from `README.md`, `CLAUDE.md`, and existing product specs in `docs/superpowers/specs`.

## Product Definition

ConvergeKit turns software repositories into searchable, AI-assisted knowledge bases.

The product has four primary user-facing jobs:

1. Let admins connect allowed GitHub repositories.
2. Index repositories into documents, semantic chunks, generated wiki pages, and repo knowledge summaries.
3. Let repository users browse Repo Guide, generated Wiki pages, and chat with repository context; let admins inspect raw indexed files when needed.
4. Let admins manage AI provider configuration, users, groups, repository access, MCP tokens, and re-indexing workflows.

The frontend is a Next.js 15 application using React 19, Tailwind CSS 4, next-intl, fumadocs UI, lucide-react icons, and custom UI primitives under `apps/web/src/components/ui`.

`[CONTRACT]` The app currently supports one locale, `en`, with locale-prefixed routes such as `/en/repositories`. New screen work should preserve locale-prefixed routing even while there is only one locale.

## Modernization Reading Rules

Use these tags when interpreting this brief:

- `[CONTRACT]` means the behavior is load-bearing. Preserve it or replace it with equivalent tests and an explicit migration note.
- `[CURRENT]` means this is how the current code works. It can change, but the engineer should know they are changing architecture, not just styling.
- `[NEGOTIABLE]` means the exact design can change without reopening product semantics.
- `[WATCH]` means the codebase has a confusing edge, legacy artifact, or possible cleanup candidate.

Modernization should not treat every line in this document with equal weight. The product contracts are evidence authority, repository scoping, role boundaries, tab routing, job lifecycle state, chat session/message behavior, one-time secret reveal flows, locale-prefixed routing, and analytics event names. Empty-state copy, icon choices, spacing, card treatments, and most non-authority colors are negotiable.

## Shared Concepts

### Repository Status

`[CONTRACT]` Repository rows and repository detail states use the shared status enum:

- `pending` - queued or not started.
- `processing` - indexing or generation is running.
- `done` - repository index is usable.
- `failed` - repository indexing failed.

### Job Lifecycle

`[CONTRACT]` The user-visible lifecycle is:

1. `repository-analysis` - clone, parse, chunk, and embed code.
2. `mind-map` - generate repository area/mind-map metadata.
3. `wiki-generation` - generate wiki sections and pages.

The Documentation tab presents this as `Indexing -> Mind map -> Wiki pages`. Wiki-only regeneration starts at the wiki/mind-map part of the lifecycle while keeping already indexed documents usable.

### Role Model

`[CONTRACT]` The role model is:

- Public visitors can view public/auth screens only.
- Standard users can access repositories assigned through group scoping, use Repo Guide, Chat, Wiki, and their own MCP token controls.
- Admins can add repositories, view the admin-only Documentation tab, manage global settings, manage users/groups, and run repository-wide mutation actions.

### Evidence Authority

`[CONTRACT]` Evidence authority is a product anchor, not decorative styling. The source of truth is `docs/superpowers/specs/2026-05-07-code-grounded-indexing-design.md`.

Minimum labels:

| Tier / State | Label              | Foreground | Background | Border / Bar |
| ------------ | ------------------ | ---------- | ---------- | ------------ |
| Tier A       | Code               | `#1D4ED8`  | `#EFF6FF`  | `#2563EB`    |
| Tier B       | Tests              | `#15803D`  | `#F0FDF4`  | `#16A34A`    |
| Tier C       | Docs               | `#475569`  | `#F8FAFC`  | `#64748B`    |
| Tier D       | Design/History     | `#6D28D9`  | `#F5F3FF`  | `#7C3AED`    |
| Alignment    | Verified / aligned | `#047857`  | `#ECFDF5`  | `#10B981`    |
| Alignment    | Stale / warning    | `#C2410C`  | `#FFF7ED`  | `#EA580C`    |
| Alignment    | Conflicting        | `#B91C1C`  | `#FEF2F2`  | `#DC2626`    |

Every citation or evidence surface must use this semantic mapping or a design-system token that preserves the same semantic separation:

- Repo Guide evidence bars.
- Repo Guide evidence chips.
- Wiki citation badges.
- Wiki source file accordions.
- Chat source/citation treatments when structured metadata is available.
- Future source accordions or answer evidence summaries.

Tier C uses a slate/neutral family on purpose so operational docs are not confused with stale/warning orange.

## Load-Bearing Contracts

`[CONTRACT]` The codebase intentionally puts behavioral rules in pure helper modules with co-located tests. A modernization should reuse these helpers or re-derive their tests against the new components. Do not re-implement them by visual inspection.

Repository detail:

- `apps/web/src/components/repository-detail/repository-tabs-state.ts`
  - Default tab is `guide`.
  - Legacy `tab=structure` maps to `guide`.
  - `tab=files` is reserved but not shown in visible tabs.
  - Documentation is admin-only.
  - Standard users currently see `guide`, `chat`, and `settings`.
- `apps/web/src/components/repository-detail/docs-tab-state.ts`
  - Derives `indexing`, `mindmap`, `wiki`, `done`, and `failed` phases.
  - Decides when wiki page polling should start.
- `apps/web/src/components/repository-detail/repo-guide-tab-state.ts`
  - Owns `preparing`, `computing-areas`, `ready`, `failed`, and `empty` view states.
  - Owns evidence chip tone mapping for the current Repo Guide implementation.
- `apps/web/src/components/repository-detail/settings-tab-permissions.test.ts`
  - Confirms MCP token controls are available to repository users while repository-wide mutations are admin-only.

Chat:

- `apps/web/src/components/repository-detail/chat-tab-state.ts`
  - Decides whether the main chat pane is loading, showing a session-load error, or ready.
- `apps/web/src/components/repository-detail/chat-history-state.ts`
  - Owns session sorting, persisted-message conversion, session-title derivation, and streamed activity merge behavior.
- `apps/web/src/components/repository-detail/chat-message-activity.ts`
  - Extracts text, reasoning, and tool activity from AI SDK messages.
- `apps/web/src/components/repository-detail/chat-code-references.ts`
  - Extracts and links code references/source pills from assistant content.

Wiki:

- `apps/web/src/components/wiki/wiki-sidebar-state.ts`
  - Owns initial open section state, section synchronization, and toggle behavior.
- `apps/web/src/components/wiki/wiki-layout-config.ts`
  - Owns rail visibility and layout breakpoints.
- `apps/web/src/components/wiki/evidence-authority.ts`
  - Owns citation labels and authority tone mapping for wiki surfaces.

Analytics:

- `repository_landing`
- `repository_tab_change`
- `repo_guide_impression`
- `repository_advanced_settings_open`
- `repository_chat_start`

Security and secret handling:

- MCP raw tokens are shown once after create/renew.
- Invite and reset URLs are shown once after issue.
- Admin self-protection rules prevent self-downgrade, self-deactivation, and self-delete.
- Repository-wide mutation actions require admin permissions.
- Repository access is centrally scoped; frontend UI must not imply access outside assigned repositories.

## Frontend Architecture Conventions

### API and Proxy Layer

`[CURRENT]` Browser code generally calls same-origin `/api/*`. In the Docker
Compose local stack, `https://convergekit-dev.local` is fronted by a reverse proxy.
The proxy keeps Next-owned API routes (`/api/chat`, `/api/sign-out`, and
`/api/notifications`) on the web container, routes the remaining `/api/*` paths
to the Hono API container, and routes all other requests to the web container.
In the legacy host-process dev flow, `apps/web/next.config.ts` rewrites many
`/api/*` routes to the Hono API on port `4001` so browser traffic stays
production-shaped.

Important routes:

- `/api/chat` is a Next route that adapts AI SDK payloads before forwarding to Hono.
- `/api/chat/sessions*` is locally rewritten directly to Hono.
- `/api/notifications/jobs/:jobId?queue=:queue` is the EventSource URL used by `useJobProgress` and is locally rewritten to Hono.
- `apps/web/src/app/api/notifications/route.ts` also contains a query-param proxy shape (`/api/notifications?jobId=...&queue=...`). Treat this as a cleanup/reconciliation candidate before changing SSE architecture.
- `/api/sign-out` exists as a same-origin sign-out proxy, but `SignOutButton` currently posts directly to `/api/auth/sign-out`.

If modernization switches to direct API calls, edge routes, a BFF layer, or a query library, document cookie/session implications before changing these paths.

### API Client

`[CURRENT]` `apps/web/src/lib/api-client.ts` is the typed client used by most client components. It wraps `fetch`, sends credentials, throws `ApiError`, and defines frontend response types.

There is no TanStack Query, SWR, Apollo, or generated Hono RPC client in the current web app. Introducing one is open for discussion, but it is an architectural migration.

### Forms and Local State

`[CURRENT]` Forms use raw React state and direct submit handlers. There is no `react-hook-form`, Formik, Zod resolver layer, or global form abstraction.

That means current form behavior is easy to trace but duplicated across dialogs. A modernization can standardize form handling, but must preserve one-time reveal states, dirty-state warnings, and inline error behavior.

### Copy and i18n

`[CURRENT]` Shared screen copy, navigation labels, tab labels, and many empty/error states live in `apps/web/messages/en.json`. Some older dialogs still contain inline strings. New modernization work should move user-facing reusable copy through the messages file unless there is a deliberate reason to keep it local to one component.

### Testing

`[CURRENT]` The frontend test convention is Vitest with focused tests around pure helpers, source contracts, and state machines. There is no broad React Testing Library suite for component rendering today.

Modernization should add or preserve tests in these categories:

- Pure helper state machines.
- Route/tab normalization.
- Chat session/message conversions.
- Wiki layout contracts.
- Evidence authority tone/label contracts.
- Permission source-contract tests where UI and API boundaries matter.

## Authoritative Spec Index

Use these as source-of-truth documents before changing related screens:

- `docs/superpowers/specs/2026-05-07-code-grounded-indexing-design.md`
  - Evidence tiers, retrieval gating, citation authority labels, shared authority palette, Repo Guide grounding.
- `docs/superpowers/specs/2026-05-07-repo-guide-question-confidence-design.md`
  - Approved next Repo Guide direction: question-first confidence cards and evidence routing matrix.
- `docs/superpowers/specs/2026-04-28-richer-chat-experience-design.md`
  - Chat history, AI Elements composition, tool/reasoning display, bounded prompt history.
- `docs/superpowers/specs/2026-04-08-wiki-revamp-design.md`
  - Wiki citation syntax, source files accordion, enriched markdown rendering.
- `docs/superpowers/specs/2026-04-15-wiki-layout-navigation-design.md`
  - Wiki three-column layout, sticky rails, left navigation behavior, responsive rail priority.
- `docs/superpowers/specs/2026-04-08-settings-page-revamp-design.md`
  - AI provider settings, model roles, dirty state, embedding warning, connection test.
- `docs/superpowers/specs/2026-03-30-regenerate-wiki-design.md`
  - Regenerate Wiki action and user-facing behavior.
- `docs/superpowers/specs/2026-04-16-user-types-design.md`
  - Roles, groups, repository scoping, user-scoped MCP token access, admin-only repository mutation.
- `docs/superpowers/specs/2026-04-17-admin-user-management-ui-design.md`
  - Users/groups admin UI and one-time invite/reset URL reveal.
- `specs/functional-requirements.md`
  - Allowed domain/org/repository-host policy and protected endpoint scoping.
- `specs/mcp-deployment-options.md`
  - MCP client distribution direction and Claude Desktop/Cursor setup context.
- `apps/api/src/routes/mcp-token-hardening-contract.test.ts`
  - MCP expiry, scopes, audit, alerts, owner filtering, deactivation, and token health contracts.

## Preserve vs Negotiable

`[CONTRACT]` Preserve or replace with equivalent tests:

- Locale-prefixed routing.
- Default repository tab routing and `tab=structure -> guide`.
- Reserved `tab=files` behavior.
- Documentation tab visibility rules.
- MCP one-time raw token reveal.
- Invite/reset one-time URL reveal.
- Admin self-protection rules.
- Evidence labels, alignment labels, and authority palette semantics.
- Analytics event names.
- Repository job phase derivation.
- Chat session/message/activity behavior.
- Wiki rail breakpoint contract.
- Server-side repository scoping assumptions.

`[NEGOTIABLE]` Open for modernization:

- Exact layout spacing and component density.
- Empty-state copy.
- Icon choices when semantics remain obvious.
- Repository row ordering and secondary metadata placement.
- Landing page card copy and visual treatment.
- Whether to keep custom primitives, adopt shadcn/ui consistently, or move to another Radix-based component system.
- Whether to introduce TanStack Query/SWR for server state.
- Whether to introduce a form library.
- Whether to add React Testing Library or Playwright coverage in addition to Vitest helper tests.

## Current Pain and Modernization Opportunities

- UI primitives are partly custom and partly Radix/shadcn-style. Decide whether to standardize on current primitives, shadcn/ui, Radix Themes, or another internal design system.
- Form state is hand-rolled and duplicated across settings, user management, and repository dialogs.
- Data loading is direct `useEffect` + local state; query caching, retries, and invalidation are manual.
- The live `/api/notifications/jobs/:jobId` rewrite and the query-param Next notification proxy should be reconciled.
- `structure-tab.tsx` still exists but is not a visible tab; document its future or remove it with a migration note.
- Admin tables are dense and may need a responsive pattern before broader rollout.
- Repo Guide has an approved question-confidence redesign that is not yet reflected in the current component.
- Screenshot coverage is absent from the repo, making visual modernization harder to evaluate.

## Component Library Decision Prompt

Before modernizing screens, choose one direction and write it down:

1. Keep the current local primitives and harden them.
2. Adopt shadcn/ui consistently, using Radix primitives and local styling.
3. Adopt Radix Themes or another complete component system.
4. Build a small internal design system over Tailwind and current tokens.

Whichever path is chosen, preserve the authority palette semantics, dense operational layouts, dialog/drawer behavior, and accessibility requirements in this brief.

## Screenshot References

`[CURRENT]` Add current-state screenshots under `docs/frontend-modernization-screenshots/` before major redesign work. The manifest in that folder lists the expected files keyed to stable screen names rather than section numbers.

## Primary User Types

### Public Visitor

An unauthenticated visitor can see the public landing page and sign-in page. They cannot access repository data, settings, chat history, wiki pages, or admin functionality.

### Standard User

A standard user signs in with email and password after receiving an invite. They can view repositories assigned through their group, open Repo Guide, use Chat, read generated Wiki pages, and create/manage their own repository-scoped MCP tokens in Advanced Settings. `[CONTRACT]` Standard users do not currently see the Documentation tab, because raw indexed document browsing is admin-only.

### Admin

An admin signs in through GitHub OAuth. Admins can add repositories, access global Settings, manage users and groups, configure AI providers, see access policy values, open the admin-only Documentation tab, re-index repositories, regenerate wiki content, delete repositories, and manage/filter MCP token ownership.

## Global Shell

Relevant files:

- `apps/web/src/app/[locale]/layout.tsx`
- `apps/web/src/components/user-nav.tsx`
- `apps/web/src/components/nav-links.tsx`
- `apps/web/src/components/admin-nav-links.tsx`

### Purpose

The shell provides a consistent top navigation bar, user session state, locale messages, and the light theme provider.

### Components

- Sticky header.
- Brand link: `ConvergeKit`.
- Primary nav link: `Repositories`.
- Admin-only nav variant: `Settings`, rendered through `AdminNavLinks`.
- User navigation area.
- Sign-in call-to-action when unauthenticated.
- User avatar or initial when authenticated.
- Sign-out action.

### Behavior

- The header stays pinned to the top of the viewport.
- The user context loads from `/api/auth/get-session`, then fetches `/api/me` for full profile and role.
- `[CONTRACT]` Admin-only navigation is hidden unless `user.role === 'admin'`; this is split into `AdminNavLinks` rather than role-gating a single global link inline.
- Admin users can click their profile area to go to `/settings`.
- Non-admin users see identity but not a settings link.
- The shell wraps all localized pages and forces the fumadocs theme to light mode.

### UI Requirements

- Keep the header compact and utilitarian.
- Use a restrained white/neutral surface with a thin bottom border.
- Preserve active nav treatment from `NavLinks`.
- All navigation links should work whether the current URL includes `/en` or another locale prefix.

## Route Map

### Public and Auth Routes

- `/` - root fallback page.
- `/en` - localized landing page.
- `/en/auth/sign-in` - sign-in screen.
- `/en/auth/accept-invite?token=...` - invite acceptance and password setup.

### Repository Routes

- `/en/repositories` - repository list.
- `/en/repositories/:id` - repository detail workspace.
- `/en/repositories/:id/wiki` - wiki index redirect screen.
- `/en/repositories/:id/wiki/:slug` - wiki article screen.

### Admin Routes

- `/en/settings` - global admin settings.
- `/api/admin/queues` - Bull Board queue UI served by the API when the Hono service is running; this is an operational admin surface, not a Next.js page.

### Web Proxy/API Routes

- `/api/chat` - web route used by the AI SDK chat transport.
- `/api/notifications/...` - notification proxy route.
- `/api/sign-out` - sign-out route.

These are not visible screens, but frontend behavior depends on them.

## Landing Page

Relevant files:

- `apps/web/src/app/[locale]/page.tsx`
- `apps/web/src/components/hero-cta.tsx`
- `apps/web/messages/en.json`

### Purpose

Introduce ConvergeKit as a shared source of truth for product managers, engineers, and AI agents. The page should quickly communicate the product loop: index the codebase, ask and verify, decide from one truth.

### Audience

Public visitors, signed-in users who return to the app root, and internal stakeholders evaluating what the product does.

### Components

- Centered hero section.
- Status badge: "Alignment for software teams".
- Main headline.
- Supporting subheadline.
- Primary CTA: `Open repositories`.
- Secondary CTA: `Sign in`, shown only when the current browser is not authenticated.
- Three audience cards:
  - For product managers.
  - For engineers.
  - For AI agents.
- Three workflow cards:
  - Index the codebase.
  - Ask and verify.
  - Decide from one truth.

### Behavior

- `HeroCta` checks session state using `/api/auth/get-session`.
- `Open repositories` routes to `/repositories`.
- When unauthenticated, the app routes the user to sign-in once protected API calls fail.

### States

- Session unknown: show primary CTA; secondary CTA remains hidden until auth check completes.
- Unauthenticated: show both Open repositories and Sign in.
- Authenticated: show only Open repositories.

### UI Requirements

- Keep it direct and product-oriented, not a marketing-heavy landing page.
- Cards should be simple repeated information units.
- Copy comes from `home` messages in `apps/web/messages/en.json`.

## Sign-In Screen

Relevant files:

- `apps/web/src/app/[locale]/auth/sign-in/page.tsx`
- `apps/web/src/components/github-sign-in-button.tsx`

### Purpose

Authenticate users into ConvergeKit. The screen supports two distinct sign-in paths: standard invited users and admins.

### Components

- Centered auth card.
- Brand link.
- Heading and description.
- Segmented tab switcher:
  - `User`.
  - `Admin`.
- User tab:
  - Email input.
  - Password input.
  - Error message.
  - Submit button.
- Admin tab:
  - GitHub sign-in button.
  - Inline OAuth startup error.
- Privacy note.

### Behavior

- User tab posts to `/api/auth/sign-in/email`.
- Successful user sign-in redirects to `/`.
- Admin tab posts to `/api/auth/sign-in/social` with provider `github`.
- Successful GitHub OAuth initialization redirects the browser to the returned OAuth URL.
- GitHub callback returns admins to `/en/repositories`.

### States

- Idle.
- Submitting email/password.
- Invalid email/password error.
- Network failure error.
- Redirecting to GitHub.
- GitHub OAuth initialization failure.

### Permissions

- Standard users authenticate by email/password.
- Admins authenticate by GitHub and are subject to the configured allowed GitHub organization policy.

### UI Requirements

- Make the user/admin distinction obvious.
- Keep the form narrow and focused.
- Use explicit error text near the failing action.

## Accept Invite / Set Password Screen

Relevant file:

- `apps/web/src/app/[locale]/auth/accept-invite/page.tsx`

### Purpose

Let invited users set or reset their password using a one-time token sent by an admin.

### Components

- Loading state while verifying token.
- Invalid link state.
- Success state after password is saved.
- Password setup form:
  - Password input.
  - Confirm password input.
  - Error message.
  - Submit button.

### Behavior

- Reads `token` from the URL query string.
- Calls `invitesApi.verify(token)` before showing the form.
- Calls `invitesApi.setPassword({ token, password })` on submit.
- Requires a minimum password length of 8 characters.
- Requires password confirmation to match.
- After success, shows a link to `/auth/sign-in`.

### States

- Verifying link.
- Invalid or expired link.
- Ready for first password setup.
- Ready for password reset.
- Password validation error.
- Submit failure.
- Password saved.

### UI Requirements

- Use clear, plain language because the user may not be familiar with ConvergeKit yet.
- Do not expose token details.
- Make success state decisive and direct users to sign in.

## Repository List Screen

Relevant files:

- `apps/web/src/app/[locale]/repositories/page.tsx`
- `apps/web/src/components/add-repository-dialog.tsx`

### Purpose

Show the repositories the current user can access and allow admins to add new repositories.

### Components

- Page title: `Repositories`.
- Admin-only `Add repository` button.
- Repository rows.
- Empty state.
- Loading state.
- Error state.
- Add Repository dialog.

### Repository Row Components

Each row should include:

- Repository icon.
- Repository name.
- Clone URL.
- Provider badge.
- Status badge.
- Last indexed date.

Status badge values:

- `pending` - Pending.
- `processing` - Processing.
- `done` - Indexed.
- `failed` - Failed.

### Behavior

- On mount, fetch repositories through `repositoriesApi.list()`.
- If the API returns 401, show "Redirecting to sign in..." and route to `/auth/sign-in`.
- Clicking a repository row opens `/repositories/:id`.
- Admins see Add repository controls.
- Non-admin users do not see Add repository controls.

### States

- Loading spinner in a bordered content block.
- Error message block.
- Admin empty state with Add repository button.
- Non-admin empty state explaining no repositories are assigned to their group.
- Populated list.

### UI Requirements

- Optimize for scanning multiple repositories.
- Keep status and provider visible on the right side of each row.
- On smaller widths, preserve name and clone URL truncation before hiding status metadata.

## Add Repository Dialog

Relevant file:

- `apps/web/src/components/add-repository-dialog.tsx`

### Purpose

Let admins select an allowed GitHub repository and start indexing it.

### Components

- Modal backdrop.
- Dialog header with title and close action.
- GitHub repository picker.
- Search input inside dropdown.
- Repository list items with public/private icon.
- Branch input shown after repository selection.
- Warning area for GitHub access warnings.
- Error message area.
- Cancel and submit actions.

### Behavior

- When opened, fetches available GitHub repositories from `githubApi.listRepos()`.
- Shows warning text if GitHub access is degraded or incomplete.
- Filters repositories by full name, repo name, or description.
- Selecting a repository sets the branch field to the repository default branch.
- On submit, posts `CreateRepositoryInput` to `repositoriesApi.create`.
- On success, closes the dialog and routes to `/repositories/:repositoryId?jobId=:jobId`.
- The repository detail screen then shows indexing progress.

### States

- Loading repositories.
- No repositories found.
- GitHub warning.
- No repository selected.
- Repository selected.
- Submitting.
- Create failure.

### Permissions

- Admin-only entry point.
- Backend also enforces access policy by allowed repository host and GitHub organization.

### UI Requirements

- Make repository selection searchable and keyboard-friendly.
- Keep branch override visible only after selection.
- Clearly distinguish private and public repositories.

## Repository Detail Workspace

Relevant files:

- `apps/web/src/app/[locale]/repositories/[id]/page.tsx`
- `apps/web/src/components/repository-detail/repository-tabs-state.ts`
- `apps/web/src/lib/repository-analytics.ts`

### Purpose

Provide the primary workspace for a single repository. This screen shows repository status, admin document/indexing tools, repo guide, chat, and advanced repository settings.

### Components

- Back link to Repositories.
- Repository header:
  - Name.
  - Provider.
- Admin-only embedding compatibility warning.
- Tab navigation:
  - Documentation, admin-only.
  - Repo Guide.
  - Chat.
  - Advanced Settings, visible to repository users for MCP tokens and extended with admin-only maintenance actions.
- Wiki link, shown when the repository is indexed.
- Active tab content area.

### Behavior

- Fetch repository metadata by id through `repositoriesApi.get(id)`.
- If unauthenticated, redirect to `/auth/sign-in`.
- If not found, show a repository not found error.
- Poll repository status every 4 seconds when repository is pending, processing, or has a follow-up documentation job.
- Read `jobId`, `queue`, and `tab` from URL query params.
- Track analytics events for landing, tab changes, Repo Guide impressions, and Advanced Settings opens.
- Admins can re-index when embedding profile mismatch is detected.

### URL Behavior

- `[CONTRACT]` `?tab=docs` opens Documentation for admins; standard users fall back to Repo Guide.
- `[CONTRACT]` `?tab=structure` maps to Repo Guide for legacy URLs.
- `[CONTRACT]` `?tab=files` is reserved for a future file browser and is not shown in visible tabs.
- `?tab=guide` opens Repo Guide.
- `?tab=chat` opens Chat.
- `?tab=settings` opens Advanced Settings for users with repository access.
- `?jobId=...&queue=...` connects progress components to a BullMQ job.

### States

- Skeleton loading state.
- Load error state.
- Repository loaded with pending/processing/done/failed status.
- Embedding mismatch warning.

### UI Requirements

- All non-chat tabs use a medium-width page (`max-w-5xl`): Documentation, Repo Guide, and Advanced Settings.
- Chat uses a wider page (`max-w-[88rem]`) to support a two-pane assistant layout.
- The View Wiki link should be secondary but easy to find after indexing completes.

### Dead / Reserved Code Policy

`[WATCH]` `apps/web/src/components/repository-detail/structure-tab.tsx` still exists as the legacy raw file-tree browser, but it is not part of the visible tab set. `repository-tabs-state.ts` maps `tab=structure` to `guide` and reserves `tab=files` without showing it. A modernizer should not treat `structure-tab.tsx` as live UI; either keep it explicitly as a future admin-only file browser seed or remove it with tests and a migration note.

## Documentation Tab

Relevant files:

- `apps/web/src/components/repository-detail/docs-tab.tsx`
- `apps/web/src/components/repository-detail/docs-tab-state.ts`
- `apps/web/src/lib/use-job-progress.ts`

### Purpose

`[CONTRACT]` This admin-only tab has two distinct UX modes:

- Job monitor mode: show repository-analysis, mind-map, and wiki-generation progress while background jobs run.
- Indexed file browser mode: let admins inspect raw indexed source documents after completion.

Do not collapse these modes into a generic "documentation" page; the phase monitor is a workflow surface, while the file browser is an inspection/debugging tool.

### Components

During processing:

- Circular progress indicator.
- Phase label.
- Short description.
- Phase stepper:
  - Indexing.
  - Mind map.
  - Wiki pages.

After completion:

- Optional wiki regeneration banner.
- Documents sidebar.
- Document content panel.
- Selected document header.
- Language badge.
- Source content preview in a monospace block.

### Behavior

- Uses `useJobProgress(jobId, queue)` for SSE job progress.
- Computes a visual phase:
  - `indexing`.
  - `mindmap`.
  - `wiki`.
  - `done`.
  - `failed`.
- Polls wiki pages after indexing/mind-map jobs finish so page generation progress can be shown.
- Fetches document list once the repository status is `done`.
- Fetches document content when the user selects a path.
- For wiki regeneration jobs, keeps indexed documents available while wiki pages update.

### Processing States

- Indexing repository.
- Mind map generation.
- Wiki page generation.
- Stalled job.
- Failed indexing.

### Done States

- No documents indexed yet.
- Select a document empty prompt.
- Loading selected document.
- Selected document displayed.
- Selected document failed to load.
- Wiki regeneration in progress.
- Wiki regeneration stalled.
- Wiki regeneration failed.
- Wiki regeneration complete.

### UI Requirements

- Make long-running background work feel understandable, not silent.
- Keep the phase stepper visible during all processing phases.
- Do not block document browsing while a wiki-only regeneration job runs.
- Use a two-column layout for the document browser: file list on the left, content on the right.

## Repo Guide Tab

Relevant files:

- `apps/web/src/components/repository-detail/repo-guide-tab.tsx`
- `apps/web/src/components/repository-detail/repo-guide-tab-state.ts`

### Purpose

Explain what ConvergeKit knows about the repository and help users ask better questions based on evidence strength. `[CONTRACT]` Repo Guide exists to expose evidence confidence and retrieval intent; it must not become a raw directory tree.

### Components

- Header and description.
- Metadata refresh hint.
- Coverage panel.
- Evidence stacked bars by repo area.
- "How to read this" panel.
- Phrasing tip panel.
- Question starter/coaching cards.
- Advanced settings hint.

### Behavior

- Fetches guide data through `repositoriesApi.getGuide(repositoryId)`.
- Calculates view state from repository status, guide status, area source, and mind map status.
- Shows preparation state when guide data is not ready.
- Shows failure state if loading fails or repo guide computation failed.
- Shows path-based temporary areas while the mind map is not ready.

### Data Concepts

`[CONTRACT]` Evidence tiers and visual tone come from the shared authority palette in `docs/superpowers/specs/2026-05-07-code-grounded-indexing-design.md`:

- `A` - Code.
- `B` - Tests.
- `C` - Docs.
- `D` - Design/History.

Coverage areas include confidence labels and evidence share counts.

`[WATCH]` `docs/superpowers/specs/2026-05-07-repo-guide-question-confidence-design.md` defines an approved modernization direction that is not fully reflected in the current component: replace raw area coverage with question-first confidence cards and a compact evidence-routing matrix. Treat that spec as the modernization target if this screen is redesigned.

### States

- Loading/preparing.
- Failed.
- Computing areas.
- Metadata refreshing.
- Ready.
- No question starters.

### UI Requirements

- The page should feel like guidance, not analytics clutter.
- Evidence bars should be readable at a glance.
- Coaching cards should make prompts actionable.
- Repo Guide bars and chips must use the same authority palette as wiki citations and source accordions.
- Avoid implying that ConvergeKit knows unsupported information; evidence quality matters.

## Chat Tab

Relevant files:

- `apps/web/src/components/repository-detail/chat-tab.tsx`
- `apps/web/src/components/repository-detail/chat-session-list.tsx`
- `apps/web/src/components/repository-detail/chat-session-view.tsx`
- `apps/web/src/components/repository-detail/chat-message-parts.tsx`
- `apps/web/src/components/ai-elements/chain-of-thought.tsx`
- `apps/web/src/components/ai-elements/code-block.tsx`
- `apps/web/src/components/ai-elements/conversation.tsx`
- `apps/web/src/components/ai-elements/message.tsx`
- `apps/web/src/components/ai-elements/prompt-input.tsx`
- `apps/web/src/components/ai-elements/reasoning.tsx`
- `apps/web/src/components/ai-elements/shimmer.tsx`
- `apps/web/src/components/ai-elements/sources.tsx`
- `apps/web/src/components/ai-elements/suggestion.tsx`
- `apps/web/src/components/ai-elements/tool.tsx`

### Purpose

Let a user ask questions about the selected repository and receive source-grounded AI responses.

### Components

Chat workspace:

- Two-pane layout on desktop.
- Conversation history rail.
- New chat icon button.
- Session cards with title and message count.
- Delete session action.
- Main conversation pane.
- Empty state with prompt suggestions.
- User and assistant messages.
- Source pills extracted from answer text.
- Search Agent Activity timeline.
- Tool details.
- Prompt input.
- Stop/submit control.
- Scroll-to-bottom button.

### AI Elements Primitive Inventory

`[CURRENT]` The `ai-elements` directory is a local primitive library for the chat surface:

- `conversation.tsx` - scrollable conversation container and scroll button.
- `message.tsx` - user/assistant message containers and markdown response rendering.
- `prompt-input.tsx` - composer, textarea, and submit/stop control.
- `suggestion.tsx` - empty-state prompt chips.
- `chain-of-thought.tsx` - collapsible activity container.
- `tool.tsx` - tool input/output display and status badge.
- `reasoning.tsx` - reasoning-specific display primitive.
- `code-block.tsx` - code block rendering support.
- `sources.tsx` - source display primitive, currently not the main source-pill implementation.
- `shimmer.tsx` - loading shimmer primitive.

A redesign can keep or replace these, but it should make an explicit decision. They are the composition layer for the current Chat tab, not incidental files.

### Behavior

- Loads repository-scoped chat sessions via `chatApi.listSessions(repositoryId)`.
- Selects the newest session unless the user explicitly starts a new chat.
- Loads selected session messages via `chatApi.getSession`.
- Creates a session lazily on first submit for a new chat.
- Uses AI SDK `useChat` with `DefaultChatTransport` targeting `/api/chat`.
- Refreshes the session list after message completion.
- Supports deleting sessions.
- For admins, blocks chat when embedding compatibility says the repository index is incompatible with the current embedding profile.

### Empty State Suggestions

Current examples:

- "What does this repository do?"
- "Where is the authentication logic?"
- "Explain the folder structure."

### States

- Loading sessions.
- Session list error.
- No conversations yet.
- Loading selected session.
- Session load error with retry.
- New empty chat.
- Sending/submitting.
- Streaming assistant response.
- Message send failure.
- Chat blocked by embedding mismatch.

### UI Requirements

- Preserve durable conversation history.
- The left rail should remain visible and useful without stealing too much width.
- Assistant responses should support markdown, code blocks, source references, reasoning/tool activity, and long content.
- User messages should be visually distinct and right-aligned enough to scan.
- The composer should remain at the bottom of the chat pane.

## Repository Advanced Settings Tab

Relevant file:

- `apps/web/src/components/repository-detail/settings-tab.tsx`

### Purpose

Provide repository-level administration and external AI-client integration through MCP tokens.

### Components

MCP token management:

- Section title and description.
- New token creation form:
  - Label input.
  - Expiry select: 7, 30, or 90 days.
  - Scope checkboxes.
  - Create button.
- New token banner:
  - One-time raw token display.
  - Client setup selector.
  - Copy config button.
  - Test connection button.
  - Connection result panel.
  - Dismiss action.
- Owner filter for admins.
- Token list.
- Token health badge.
- Token metadata:
  - Owner.
  - Fingerprint.
  - Expiry.
  - Scopes.
  - Last used details.
  - Creation time.
  - Revocation reason when present.
- Token actions:
  - Setup.
  - Renew.
  - Audit.
  - Alerts.
  - Test.
  - Revoke.
- Expanded setup panel.
- Expanded audit trail.
- Expanded suspicious-use alerts.

Admin maintenance:

- Re-index section.
- Regenerate Wiki section.
- Danger Zone section.
- Delete repository confirmation dialog.

### MCP Scopes

- `repo:read` - Repository structure.
- `docs:search` - Documentation search.
- `files:read` - File reads.

### MCP Client Configurations

- Claude Desktop.
- Cursor.
- Generic JSON.

### Behavior

- Loads MCP tokens through `repositoriesApi.listMcpTokens`.
- Admins can filter tokens by owner.
- Creating or renewing a token returns the raw token only once.
- Token owners can copy generated client config JSON.
- Token owners can test token connectivity.
- Setup, audit, and alert panels expand on demand and fetch data lazily.
- Alerts can be acknowledged.
- Re-index starts a full repository analysis job and routes to Documentation with job query params.
- Regenerate Wiki starts a wiki-generation job using the existing index and routes to Documentation with job query params.
- Delete repository confirms before deletion and then returns to the repository list.

### States

- No tokens.
- Creating token.
- Token creation error.
- New token visible.
- Testing connection.
- Connection passed.
- Connection failed.
- Expanded setup/audit/alert panels.
- Re-index starting.
- Re-index error.
- Wiki regeneration starting.
- Wiki regeneration error.
- Delete confirmation.
- Delete error.

### Permissions

- `[CONTRACT]` Advanced Settings is visible to repository users so they can manage their own MCP tokens.
- `[CONTRACT]` Repository-wide actions inside Advanced Settings are admin-only: re-index, regenerate wiki, and delete repository.
- `[CONTRACT]` Token-owner-only actions are disabled for tokens that do not belong to the current user.
- `[CONTRACT]` Admins can see token owners and filter by owner.
- Source tests to preserve: `apps/web/src/components/repository-detail/settings-tab-permissions.test.ts`, `apps/api/src/routes/repository-action-permissions.test.ts`, and `apps/api/src/routes/mcp-token-hardening-contract.test.ts`.

### UI Requirements

- Treat raw token display as a high-attention moment because it is shown once.
- Keep setup config copyable and readable in a code block.
- Clearly distinguish destructive actions from routine configuration.
- Danger Zone must remain visually separate.

## Wiki Index Screen

Relevant file:

- `apps/web/src/app/[locale]/repositories/[id]/wiki/page.tsx`

### Purpose

Route users to the first available generated wiki page for a repository.

### Components

- Redirect behavior when pages exist.
- Empty/no-wiki state when no pages exist.
- Back to repository link.

### Behavior

- Fetches wiki sections from `/api/wiki/:repositoryId/pages` with server-side cookies.
- Redirects unauthenticated users to sign-in.
- Redirects to the first `done` child page.
- If no page is done, redirects to the first available page.
- If no pages exist, displays "Wiki not yet generated".

### States

- Auth redirect.
- Fetch failure treated as no data.
- Redirect to first done page.
- Redirect to first pending page.
- No wiki pages yet.

### UI Requirements

- The user should rarely stay on this screen.
- The no-wiki state should explain that wiki pages are generated after indexing and direct the user back to the repository.

## Wiki Layout and Article Screen

Relevant files:

- `apps/web/src/app/[locale]/repositories/[id]/wiki/layout.tsx`
- `apps/web/src/app/[locale]/repositories/[id]/wiki/[slug]/page.tsx`
- `apps/web/src/components/wiki/wiki-sidebar.tsx`
- `apps/web/src/components/wiki/wiki-page-content.tsx`
- `apps/web/src/components/wiki/wiki-toc.tsx`
- `apps/web/src/components/wiki/source-files-accordion.tsx`
- `apps/web/src/components/wiki/citation-badge.tsx`
- `apps/web/src/components/wiki/mermaid-diagram.tsx`
- `apps/web/src/components/wiki/evidence-authority.ts`

### Purpose

Provide a documentation-style reader for generated repository wiki content. The load-bearing wiki specs are `docs/superpowers/specs/2026-04-08-wiki-revamp-design.md` for citations/source files and `docs/superpowers/specs/2026-04-15-wiki-layout-navigation-design.md` for the three-column documentation layout.

### Layout Components

- Left rail: repo-wide wiki navigation.
- Center article column.
- Right rail: "On this page" heading TOC.

### Left Wiki Sidebar Components

- Repository name link back to repository detail.
- Last indexed date.
- Commit SHA prefix when available.
- Collapsible wiki sections.
- Page links.
- Active page indicator.
- Pending/generating page indicator.

### Article Components

- Relevant source files accordion.
- Markdown renderer.
- Headings.
- Paragraphs and lists.
- Tables.
- Blockquotes.
- Inline code and code blocks.
- Mermaid diagrams.
- Citation badges.
- Relative wiki page links.

### Right TOC Components

- "On this page" title.
- H2 and H3 heading links.
- Active heading state.
- Smooth scroll behavior.

### Behavior

- Layout fetches repository metadata and wiki page tree server-side with cookies.
- Unauthenticated users redirect to sign-in.
- Wiki article fetches the current page by slug.
- 202 response shows a page-generating state.
- 404 response shows Next.js not found.
- Failed page status shows a generation failure message.
- `[CONTRACT]` Citation-looking links with empty href render as `CitationBadge`.
- `[CONTRACT]` Citation labels and source-file authority chips must use `evidence-authority.ts` and the shared authority palette.
- Relative wiki links resolve against the current wiki base path.
- Mermaid code blocks render through the client-only Mermaid component.
- The left wiki rail is visible from medium widths.
- The right "On this page" rail is visible from extra-large widths.

### States

- Page generating.
- Page failed.
- Page not found.
- Page loaded.
- No source files.
- No headings for right TOC.
- Pending page in sidebar.

### UI Requirements

- The wiki should feel like documentation, not a dashboard.
- Left rail should be a durable documentation navigator.
- Article text should stay within a comfortable reading width.
- Source evidence should be visible but not louder than the article.
- Citation badges should communicate evidence type and alignment.
- Tier D `Design/History` citations must not look identical to Tier A `Code` citations.
- Stale/warning and conflicting states must remain visually distinct from Tier C `Docs`.

## Global Settings Screen

Relevant files:

- `apps/web/src/app/[locale]/settings/layout.tsx`
- `apps/web/src/app/[locale]/settings/page.tsx`
- `apps/web/src/components/admin-guard.tsx`
- `apps/web/src/components/settings/settings-tabs.tsx`

### Purpose

Provide admin-only application configuration and organization management.

### Components

- Admin guard.
- Page title and description.
- Settings tab navigation:
  - AI provider.
  - Users.
  - Groups.
  - Access policy.

### Behavior

- Server component checks `/api/me`; non-admin users redirect to `/`.
- Client `AdminGuard` provides a fallback redirect for non-admin users.
- Fetches initial AI settings, access policy, and whether any repositories are indexed.
- Defaults are used if settings fetches fail.

### States

- Admin guard loading.
- Unauthorized redirect.
- AI settings loaded.
- Fallback defaults loaded.

### UI Requirements

- Settings should feel operational and dense, not promotional.
- Tabs should clearly separate provider setup, people management, group access, and deployment policy.

## Settings: AI Provider Tab

Relevant files:

- `apps/web/src/components/settings/settings-client.tsx`
- `apps/web/src/components/settings/ai-provider-form.tsx`
- `apps/web/src/components/settings/connection-test.tsx`

### Purpose

Let admins choose the AI provider and configure model settings used for embeddings, chat, wiki generation, and mind map generation.

### Components

- Provider selection cards:
  - LM Studio.
  - OpenRouter.
  - Anthropic.
  - OpenAI.
- API key input for cloud providers.
- Masked stored key display.
- Clear key action.
- Endpoint field for OpenRouter and OpenAI.
- Model configuration section:
  - Embedding model.
  - Chat model.
  - Wiki and mind map model.
- Refresh models button.
- Model fetch warning/error.
- Dirty state message.
- Save button.
- Embedding model change warning dialog.
- Connection test panel.
- Account section with sign-out.

### Behavior

- Fetches current AI settings client-side after initial SSR data.
- Switching providers restores that provider's saved models.
- LM Studio needs no API key.
- OpenRouter, Anthropic, and OpenAI need a saved or newly entered API key.
- Model lists are fetched per provider where possible.
- OpenRouter uses text inputs for model IDs and validates against known model IDs when available.
- Anthropic uses curated model lists.
- Saving with changed embedding model while repositories are indexed shows a confirmation warning.
- Connection test checks embedding and language model reachability using the current draft values.

### States

- Loading provider settings.
- Provider selected.
- Needs API key.
- Has masked API key.
- Fetching models.
- Model fetch error.
- No embedding models.
- Unsaved changes.
- Saving.
- Saved.
- Embedding change confirmation.
- Connection test idle.
- Connection test running.
- All connections healthy.
- Partial or failed connections.

### UI Requirements

- Make provider selection clear and reversible.
- Explain each model role because embedding/chat/wiki models are not interchangeable.
- Warn about embedding changes because they can invalidate search quality for existing indexes.
- Keep connection test results close to the form.

## Settings: Users Tab

Relevant files:

- `apps/web/src/components/settings/users-panel.tsx`
- `apps/web/src/components/settings/users-invite-dialog.tsx`
- `apps/web/src/components/settings/users-edit-dialog.tsx`
- `apps/web/src/components/settings/users-url-reveal-dialog.tsx`

### Purpose

Let admins invite, edit, deactivate, reactivate, delete, and bulk-manage users.

### Components

- User count summary.
- Invite user button.
- Users table:
  - Selection checkbox.
  - Name and avatar.
  - Email.
  - Role.
  - Group.
  - Status.
  - Row actions menu.
- Bulk action bar.
- Invite user dialog.
- Edit user dialog.
- Invite/reset URL reveal dialog.

### Behavior

- Fetches users and groups together.
- Allows selecting all or individual users.
- Row menu supports:
  - Edit.
  - Resend invite when pending.
  - Reset password when active.
  - Revoke MCP tokens.
  - Deactivate or reactivate.
  - Delete.
- Bulk bar supports:
  - Assign group.
  - Change role.
  - Delete.
  - Revoke MCP tokens.
  - Deactivate.
- The current admin cannot downgrade, deactivate, or delete themselves.
- Invite creates a pending user and returns a one-time invite URL.
- Reset password returns a one-time reset URL.

### User Statuses

- Active.
- Pending.
- Deactivated.

### States

- Loading users.
- Empty users table, if no users exist.
- Row menu open.
- Invite form submitting.
- Edit form submitting.
- URL reveal.
- Bulk selection active.
- Confirmation prompts for destructive operations.

### UI Requirements

- Keep the table scannable.
- Make self-protection rules visible when an action is disabled.
- Treat invite/reset URLs as one-time secrets and make copy flow obvious.

## Settings: Groups Tab

Relevant files:

- `apps/web/src/components/settings/groups-panel.tsx`
- `apps/web/src/components/settings/group-detail-drawer.tsx`
- `apps/web/src/components/settings/groups-create-dialog.tsx`
- `apps/web/src/components/settings/groups-edit-dialog.tsx`
- `apps/web/src/components/settings/group-add-members-dialog.tsx`
- `apps/web/src/components/settings/group-assign-repos-dialog.tsx`

### Purpose

Let admins group users and assign repository access by group.

### Components

- Group count summary.
- New group button.
- Groups table:
  - Name.
  - Description.
  - Member count.
  - Repository count.
  - Created date.
  - Delete action.
- Group detail drawer.
- Create group dialog.
- Edit group dialog.
- Add members dialog.
- Assign repositories dialog.

### Behavior

- Fetches group list, then fetches details per group to compute member and repo counts.
- Clicking a group row opens the detail drawer.
- Deleting a group asks for confirmation and unassigns members.
- Detail drawer shows group metadata, members, and repositories.
- Members can be added through a searchable multi-select.
- Members can be removed from the group.
- Repositories can be assigned through a searchable multi-select.
- Repositories can be unassigned.

### States

- Loading groups.
- No groups.
- Drawer loading.
- Drawer ready.
- Create/edit form errors.
- Add members loading.
- Assign repositories loading.
- No eligible users.
- No unassigned repositories.

### UI Requirements

- Keep group management lightweight and direct.
- Use the drawer for details so admins do not lose their place in the table.
- Searchable multi-selects must show labels and secondary identifiers.

## Settings: Access Policy Tab

Relevant file:

- `apps/web/src/components/settings/access-policy-panel.tsx`

### Purpose

Show deployment-level access policy values that control who can sign in and which repositories can be indexed.

### Components

- Read-only settings card.
- Rows:
  - Allowed email domain.
  - Allowed GitHub organization.
  - Allowed repository host.
- Read-only explanatory footer.

### Behavior

- Values are fetched from `/api/settings/access-policy`.
- Values are read-only in the frontend.
- Changes must be made through deployment configuration.

### States

- Loaded policy.
- Fallback default policy if fetch fails in the page server component.

### UI Requirements

- Make the read-only nature explicit.
- Use monospace values for exact configuration strings.

## Common UI Primitives and Patterns

Relevant files:

- `apps/web/src/components/ui/badge.tsx`
- `apps/web/src/components/ui/button-group.tsx`
- `apps/web/src/components/ui/button.tsx`
- `apps/web/src/components/ui/collapsible.tsx`
- `apps/web/src/components/ui/command.tsx`
- `apps/web/src/components/ui/dialog.tsx`
- `apps/web/src/components/ui/drawer.tsx`
- `apps/web/src/components/ui/dropdown-menu.tsx`
- `apps/web/src/components/ui/hover-card.tsx`
- `apps/web/src/components/ui/input-group.tsx`
- `apps/web/src/components/ui/input.tsx`
- `apps/web/src/components/ui/multi-select.tsx`
- `apps/web/src/components/ui/scroll-area.tsx`
- `apps/web/src/components/ui/select.tsx`
- `apps/web/src/components/ui/separator.tsx`
- `apps/web/src/components/ui/spinner.tsx`
- `apps/web/src/components/ui/textarea.tsx`
- `apps/web/src/components/ui/tooltip.tsx`
- `apps/web/src/app/globals.css`

### Primitive Inventory

`[CURRENT]` The local UI primitive inventory is 18 files:

- `badge.tsx`
- `button-group.tsx`
- `button.tsx`
- `collapsible.tsx`
- `command.tsx`
- `dialog.tsx`
- `drawer.tsx`
- `dropdown-menu.tsx`
- `hover-card.tsx`
- `input-group.tsx`
- `input.tsx`
- `multi-select.tsx`
- `scroll-area.tsx`
- `select.tsx`
- `separator.tsx`
- `spinner.tsx`
- `textarea.tsx`
- `tooltip.tsx`

Use this full inventory when deciding whether to keep current primitives, replace them with shadcn/ui, or adopt a different component system.

### Required Patterns

- Use small, dense controls appropriate for operational software.
- Prefer lucide-react icons in icon buttons and action buttons.
- Keep cards to repeated items, dialogs, and framed tools.
- Use tabs for alternate views in the same workflow.
- Use dialogs for focused forms.
- Use drawers for detailed side panels that preserve list context.
- Use badges for statuses and evidence labels.
- Use table layouts for admin management lists.
- Use inline errors near the failing form or action.
- Use confirmation prompts/dialogs for destructive actions.

### Visual System

- `[CURRENT]` The app forces light theme through `RootProvider`.
- `[NEGOTIABLE]` Dark mode is out of scope by default for a modernization pass unless it is explicitly approved as a design-system deliverable. If dark mode enters scope, add token definitions, evidence-authority equivalents, screenshot coverage, and WCAG contrast acceptance criteria before implementation.
- Neutral background and foreground tokens from CSS variables.
- Primary action usually uses neutral-900/foreground.
- Secondary actions use white background and neutral borders.
- Destructive actions use red accents and separated danger surfaces.
- Success states use green accents.
- Warning states use amber/orange accents.
- Informational states use blue accents.

## Data and API Dependencies by Screen

### Landing

- `/api/auth/get-session`

### Sign In

- `/api/auth/sign-in/email`
- `/api/auth/sign-in/social`

### Accept Invite

- `/api/invites/verify`
- `/api/invites/set-password`

### Repository List

- `/api/repositories`
- `/api/repositories/github-repos`
- `/api/repositories` POST

### Repository Detail

- `/api/repositories/:id`
- `/api/notifications/jobs/:jobId?queue=:queue` for the current `useJobProgress` EventSource path.
- `[WATCH]` `apps/web/src/app/api/notifications/route.ts` exposes an alternate query-param proxy shape (`/api/notifications?jobId=...&queue=...`); reconcile this before changing SSE routing.

### Documentation Tab

- `/api/documents?repositoryId=...`
- `/api/documents/content?repositoryId=...&path=...`
- `/api/wiki/:repositoryId/pages`

### Repo Guide Tab

- `/api/repositories/:id/guide`

### Chat Tab

- `/api/chat?repositoryId=...`
- `/api/chat/sessions`
- `/api/chat/sessions/:sessionId`
- `/api/chat` streaming route

### Repository Settings

- `/api/repositories/:id/mcp-tokens`
- `/api/repositories/:id/mcp-tokens/:tokenId/config`
- `/api/repositories/:id/mcp-tokens/:tokenId/audit`
- `/api/repositories/:id/mcp-tokens/:tokenId/alerts`
- `/api/repositories/:id/mcp-tokens/:tokenId/test`
- `/api/repositories/:id/reindex`
- `/api/repositories/:id/regenerate-wiki`
- `/api/repositories/:id` DELETE

### Global Settings

- `/api/me`
- `/api/settings/ai`
- `/api/settings/access-policy`
- `/api/settings/*-models`
- `/api/settings/test`
- `/api/users`
- `/api/groups`

## Accessibility and Interaction Requirements

- `[CONTRACT]` Target WCAG 2.2 AA for redesigned screens unless a stricter internal standard is adopted.
- All icon-only buttons need accessible labels or titles.
- Dialogs and drawers should close on Escape.
- Dialog and drawer backdrops should close when appropriate, except during destructive submissions.
- Form inputs need visible labels.
- Loading states should not leave empty panels.
- Destructive actions require confirmation.
- Disabled actions should explain why when the reason is not obvious.
- Long repository names, file paths, model IDs, and URLs need truncation or wrapping based on context.
- Keyboard users should be able to tab through forms, tabs, row actions, and dialogs.

## Responsive Expectations

### General App

- Header stays compact.
- Repository rows preserve core identity first: name and clone URL.
- Admin tables may overflow horizontally if needed, but should remain readable.
- Dialogs should fit within viewport width with side padding.

### Repository Detail

- Non-chat tabs use a constrained page width.
- Chat uses a wide layout, stacking the session rail above the conversation on smaller screens.

### Wiki

- Desktop: left wiki rail, article, and right TOC.
- Small laptop/tablet: left wiki rail remains, right TOC hides first.
- Mobile: article is primary; current CSS hides wiki rails below the configured breakpoints.

## Analytics Events

Repository detail currently tracks:

- `repository_landing`.
- `repository_tab_change`.
- `repo_guide_impression`.
- `repository_advanced_settings_open`.
- `repository_chat_start`.

Frontend changes to repository detail should preserve these event names and include repository id and active tab where relevant.

## Known Product Boundaries

The current frontend does not include:

- A global chat outside a repository.
- Chat attachments.
- Search across all repositories.
- Branch selection in repository detail.
- Wiki edit mode.
- Per-chat model selection.
- Public sharing of wiki pages or chat sessions.
- Mobile drawer navigation for the wiki rails.

These are natural future extensions but should not be assumed to exist in current screen work.

Existing artifacts that should not be carried forward blindly:

- `structure-tab.tsx` is legacy/reserved, not visible product UI.
- The alternate query-param notifications proxy may be redundant with the `/api/notifications/jobs/:jobId` rewrite.
- The current Repo Guide area coverage UI has an approved question-confidence replacement spec.
- Some UI primitives overlap in style and maturity; standardize intentionally rather than copying all existing patterns.

## Suggested Modernization Priorities

Use this as a practical order of operations for the frontend engineer:

1. Make the component-library decision from `Component Library Decision Prompt`; do not modernize screens before deciding whether current primitives are being kept, replaced, or wrapped.
2. Preserve the contracts in `Load-Bearing Contracts`, especially tab routing, job phases, evidence authority, chat state, one-time reveal flows, and permission boundaries.
3. Address the `Current Pain and Modernization Opportunities` items intentionally: form strategy, server-state strategy, notifications proxy cleanup, reserved `structure-tab.tsx`, responsive admin tables, and Repo Guide's question-confidence redesign.
4. Capture the screenshot manifest before visual changes, then use screenshots plus helper tests as review evidence.
5. Expand tests around the pure helpers before replacing major UI surfaces.
6. Treat dark mode, new component systems, React Testing Library, Playwright coverage, and query/form libraries as explicit scope choices, not incidental upgrades.
