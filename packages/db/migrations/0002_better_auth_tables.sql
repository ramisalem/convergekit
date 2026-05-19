-- ─── Better-auth tables ───────────────────────────────────────────────────────

CREATE TABLE "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "email_verified" boolean NOT NULL,
  "image" text,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
--> statement-breakpoint

CREATE TABLE "session" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamp NOT NULL,
  "token" text NOT NULL UNIQUE,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
--> statement-breakpoint

CREATE TABLE "account" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "scope" text,
  "password" text,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
--> statement-breakpoint

CREATE TABLE "verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp,
  "updated_at" timestamp
);
--> statement-breakpoint

-- ─── Migrate repositories, chat_sessions, mcp_tokens from users (uuid) → user (text) ──

-- Drop old FK constraints first
ALTER TABLE "repositories" DROP CONSTRAINT IF EXISTS "repositories_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_sessions" DROP CONSTRAINT IF EXISTS "chat_sessions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "mcp_tokens" DROP CONSTRAINT IF EXISTS "mcp_tokens_user_id_users_id_fk";
--> statement-breakpoint

-- Change column type from uuid to text
ALTER TABLE "repositories" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
--> statement-breakpoint
ALTER TABLE "chat_sessions" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
--> statement-breakpoint
ALTER TABLE "mcp_tokens" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
--> statement-breakpoint

-- Add new FK constraints pointing to "user"
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- Drop old users table (no longer needed — better-auth owns the "user" table)
DROP TABLE IF EXISTS "users";
