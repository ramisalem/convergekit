-- MCP OAuth foundation: ConvergeKit-owned access/refresh token store (hashed at rest,
-- rotating, reuse-detected, 60-day absolute cap) and short-lived authorization codes.

CREATE TABLE IF NOT EXISTS "mcp_oauth_token" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "family_id" uuid NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "client_id" text NOT NULL,
  "access_token_hash" text NOT NULL,
  "refresh_token_hash" text,
  "scopes" text[] NOT NULL,
  "access_token_expires_at" timestamp NOT NULL,
  "refresh_token_expires_at" timestamp,
  "absolute_expires_at" timestamp NOT NULL,
  "rotated_from_id" uuid,
  "revoked_at" timestamp,
  "revoked_reason" text,
  "last_used_at" timestamp,
  "last_used_ip" text,
  "last_used_user_agent" text,
  "last_used_client_name" text,
  "last_used_tool_name" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "mcp_oauth_token_access_hash_unique"
  ON "mcp_oauth_token"("access_token_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_oauth_token_refresh_hash_unique"
  ON "mcp_oauth_token"("refresh_token_hash");
CREATE INDEX IF NOT EXISTS "mcp_oauth_token_user_idx" ON "mcp_oauth_token"("user_id");
CREATE INDEX IF NOT EXISTS "mcp_oauth_token_family_idx" ON "mcp_oauth_token"("family_id");
CREATE INDEX IF NOT EXISTS "mcp_oauth_token_client_idx" ON "mcp_oauth_token"("client_id");
CREATE INDEX IF NOT EXISTS "mcp_oauth_token_active_idx"
  ON "mcp_oauth_token"("revoked_at", "access_token_expires_at");

CREATE TABLE IF NOT EXISTS "mcp_oauth_authorization_code" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code_hash" text NOT NULL,
  "client_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "redirect_uri" text NOT NULL,
  "scopes" text[] NOT NULL,
  "code_challenge" text NOT NULL,
  "code_challenge_method" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "consumed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "mcp_oauth_authorization_code_hash_unique"
  ON "mcp_oauth_authorization_code"("code_hash");
CREATE INDEX IF NOT EXISTS "mcp_oauth_authorization_code_user_idx"
  ON "mcp_oauth_authorization_code"("user_id");
