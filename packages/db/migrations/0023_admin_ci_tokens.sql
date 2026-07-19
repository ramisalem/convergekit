-- Admin-level CI/automation tokens (spec 2026-07-09-admin-ci-tokens-design.md).
-- A CI token is an mcp_tokens row with repository_id NULL, owned by an admin.
-- DROP NOT NULL is naturally idempotent and safe to re-run in any environment.
-- History: the originally-shipped version of this file also hard-revoked legacy tokens; 0024 repairs that wherever it ran.

ALTER TABLE "mcp_tokens" ALTER COLUMN "repository_id" DROP NOT NULL;
ALTER TABLE "mcp_token_alerts" ALTER COLUMN "repository_id" DROP NOT NULL;
