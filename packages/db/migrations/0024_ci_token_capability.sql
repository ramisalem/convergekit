-- (a) Un-revoke the rows the ORIGINAL 0023 killed, wherever it ran (no-op in prod).
UPDATE "mcp_tokens" SET "revoked_at" = NULL, "revoked_reason" = NULL
WHERE "revoked_reason" = 'admin_token_migration';

-- (b) Add the capability column, default off for everyone. No backfill here.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "ci_tokens_enabled" boolean NOT NULL DEFAULT false;
