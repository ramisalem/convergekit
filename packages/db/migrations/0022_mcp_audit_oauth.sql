-- Extend MCP audit events to record OAuth principals (no static fingerprint/token_id).
ALTER TABLE "mcp_token_audit_events" ALTER COLUMN "token_label" DROP NOT NULL;
ALTER TABLE "mcp_token_audit_events" ALTER COLUMN "token_fingerprint" DROP NOT NULL;
ALTER TABLE "mcp_token_audit_events"
  ADD COLUMN IF NOT EXISTS "principal_kind" text DEFAULT 'static' NOT NULL,
  ADD COLUMN IF NOT EXISTS "client_id" text,
  ADD COLUMN IF NOT EXISTS "oauth_token_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mcp_token_audit_events_oauth_token_id_fk'
  ) THEN
    ALTER TABLE "mcp_token_audit_events"
      ADD CONSTRAINT "mcp_token_audit_events_oauth_token_id_fk"
      FOREIGN KEY ("oauth_token_id") REFERENCES "mcp_oauth_token"("id") ON DELETE SET NULL;
  END IF;
END $$;
