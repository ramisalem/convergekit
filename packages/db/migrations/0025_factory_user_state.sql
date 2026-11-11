-- Factory module: per-viewer state (onboarding). Idempotent, safe to re-run.
CREATE TABLE IF NOT EXISTS "factory_user_state" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "github_login" text,
  "onboarded_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
