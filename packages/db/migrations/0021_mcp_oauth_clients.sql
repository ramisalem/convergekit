-- Better Auth MCP plugin tables for Dynamic Client Registration. The plugin owns
-- writes to oauth_application via /api/auth/mcp/register; our authorize endpoint
-- reads it. access-token/consent tables exist for adapter completeness only.

CREATE TABLE IF NOT EXISTS "oauth_application" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text,
  "icon" text,
  "metadata" text,
  "client_id" text NOT NULL,
  "client_secret" text,
  "redirect_urls" text,
  "type" text,
  "disabled" boolean DEFAULT false,
  "user_id" text REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_application_client_id_unique" ON "oauth_application"("client_id");
CREATE INDEX IF NOT EXISTS "oauth_application_user_idx" ON "oauth_application"("user_id");

CREATE TABLE IF NOT EXISTS "oauth_access_token" (
  "id" text PRIMARY KEY NOT NULL,
  "access_token" text,
  "refresh_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "client_id" text,
  "user_id" text REFERENCES "user"("id") ON DELETE CASCADE,
  "scopes" text,
  "created_at" timestamp,
  "updated_at" timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_access_token_access_token_unique" ON "oauth_access_token"("access_token");
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_access_token_refresh_token_unique" ON "oauth_access_token"("refresh_token");

CREATE TABLE IF NOT EXISTS "oauth_consent" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text,
  "user_id" text REFERENCES "user"("id") ON DELETE CASCADE,
  "scopes" text,
  "created_at" timestamp,
  "updated_at" timestamp,
  "consent_given" boolean
);
