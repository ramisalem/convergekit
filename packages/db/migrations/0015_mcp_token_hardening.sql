-- Harden MCP tokens with expiry, scopes, soft revocation, fingerprints, audit, alerts,
-- and admin-driven user deactivation.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "deactivated_at" timestamp;

ALTER TABLE "mcp_tokens" ADD COLUMN IF NOT EXISTS "fingerprint" text;
UPDATE "mcp_tokens"
SET "fingerprint" = 'cw_' || substr("token_hash", 1, 8) || '.' || substr("token_hash", 61, 4)
WHERE "fingerprint" IS NULL;
ALTER TABLE "mcp_tokens" ALTER COLUMN "fingerprint" SET NOT NULL;

ALTER TABLE "mcp_tokens"
  ADD COLUMN IF NOT EXISTS "scopes" text[] DEFAULT ARRAY['repo:read', 'docs:search', 'files:read']::text[] NOT NULL,
  ADD COLUMN IF NOT EXISTS "expires_at" timestamp,
  ADD COLUMN IF NOT EXISTS "revoked_at" timestamp,
  ADD COLUMN IF NOT EXISTS "revoked_reason" text,
  ADD COLUMN IF NOT EXISTS "last_used_ip" text,
  ADD COLUMN IF NOT EXISTS "last_used_user_agent" text,
  ADD COLUMN IF NOT EXISTS "last_used_client_name" text,
  ADD COLUMN IF NOT EXISTS "last_used_tool_name" text,
  ADD COLUMN IF NOT EXISTS "rotated_from_token_id" uuid;

UPDATE "mcp_tokens"
SET
  "expires_at" = now(),
  "revoked_at" = COALESCE("revoked_at", now()),
  "revoked_reason" = COALESCE("revoked_reason", 'force_rotate_static_token_rollout')
WHERE "expires_at" IS NULL;

ALTER TABLE "mcp_tokens" ALTER COLUMN "expires_at" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mcp_tokens_rotated_from_token_id_mcp_tokens_id_fk'
  ) THEN
    ALTER TABLE "mcp_tokens"
      ADD CONSTRAINT "mcp_tokens_rotated_from_token_id_mcp_tokens_id_fk"
      FOREIGN KEY ("rotated_from_token_id") REFERENCES "mcp_tokens"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "mcp_tokens_repository_user_idx"
  ON "mcp_tokens"("repository_id", "user_id");
CREATE INDEX IF NOT EXISTS "mcp_tokens_active_idx"
  ON "mcp_tokens"("revoked_at", "expires_at");

CREATE TABLE IF NOT EXISTS "mcp_token_audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_id" uuid REFERENCES "mcp_tokens"("id") ON DELETE SET NULL,
  "repository_id" uuid REFERENCES "repositories"("id") ON DELETE SET NULL,
  "user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "token_label" text NOT NULL,
  "token_fingerprint" text NOT NULL,
  "client_label" text,
  "client_name" text,
  "ip_address" text,
  "user_agent" text,
  "method" text NOT NULL,
  "tool_name" text,
  "latency_ms" integer DEFAULT 0 NOT NULL,
  "status" text NOT NULL,
  "status_code" integer,
  "error_code" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "mcp_token_audit_events_token_idx"
  ON "mcp_token_audit_events"("token_id", "created_at");
CREATE INDEX IF NOT EXISTS "mcp_token_audit_events_repo_idx"
  ON "mcp_token_audit_events"("repository_id", "created_at");

CREATE TABLE IF NOT EXISTS "mcp_token_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_id" uuid NOT NULL REFERENCES "mcp_tokens"("id") ON DELETE CASCADE,
  "repository_id" uuid NOT NULL REFERENCES "repositories"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "message" text NOT NULL,
  "details" text,
  "status" text DEFAULT 'open' NOT NULL,
  "first_seen_at" timestamp DEFAULT now() NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  "acknowledged_at" timestamp
);

CREATE INDEX IF NOT EXISTS "mcp_token_alerts_token_status_idx"
  ON "mcp_token_alerts"("token_id", "status");
CREATE INDEX IF NOT EXISTS "mcp_token_alerts_repo_status_idx"
  ON "mcp_token_alerts"("repository_id", "status");
