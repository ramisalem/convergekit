# Factory profile: storefront

Everything the factory needs to know about this repo.

## Repo

| Key | Value |
| --- | --- |
| Repo | `acme/storefront` |
| Product | Acme Shop |
| App | Storefront (Next.js) |
| Integration branch | `develop` |
| Production branch | `main` |
| Staging site | https://staging.shop.example.com (basic auth, ask the lead) |
| Sibling repos | `acme-labs/billing_api` (API) |

## People

| Key | Value |
| --- | --- |
| Product owner | @pat-owner |
| QA | @quinn-qa (backup: qa-team@example.com) |
| Developers | @dev-one, @dev-two, @dev-one |
| Umbrella approvals | 2 |
| Review accounts | @acme-review-bot |

## Setup

```bash
| Key | Value |
pnpm install
```

## Checks

| Check | Command | Notes |
| --- | --- | --- |
| Tests | `pnpm test` |  |
