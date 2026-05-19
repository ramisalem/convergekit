-- User invitations (invite + admin-initiated password reset)
-- Single-use tokens issued by admins; raw token is hashed with SHA-256 at rest.

CREATE TABLE IF NOT EXISTS "user_invitations" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "user_invitations_user_id_idx" ON "user_invitations"("user_id");
CREATE INDEX IF NOT EXISTS "user_invitations_active_idx"
  ON "user_invitations"("user_id")
  WHERE "used_at" IS NULL;
