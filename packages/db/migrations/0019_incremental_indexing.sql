CREATE TABLE IF NOT EXISTS "indexing_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "repository_id" uuid NOT NULL REFERENCES "repositories"("id") ON DELETE CASCADE,
  "branch_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "trigger" text NOT NULL,
  "status" text NOT NULL,
  "queue_name" text,
  "job_id" text,
  "from_commit" text,
  "to_commit" text,
  "remote_head" text,
  "changed_file_count" integer NOT NULL DEFAULT 0,
  "deleted_file_count" integer NOT NULL DEFAULT 0,
  "skipped_file_count" integer NOT NULL DEFAULT 0,
  "chunk_count" integer NOT NULL DEFAULT 0,
  "skipped_embedding_count" integer NOT NULL DEFAULT 0,
  "failure_reason" text,
  "failure_code" text,
  "started_at" timestamp,
  "finished_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "indexing_runs_repo_created_idx"
  ON "indexing_runs" ("repository_id", "created_at");
CREATE INDEX IF NOT EXISTS "indexing_runs_branch_status_idx"
  ON "indexing_runs" ("branch_id", "status");

-- At most one active incremental run per branch.
CREATE UNIQUE INDEX IF NOT EXISTS "indexing_runs_active_branch_unique"
  ON "indexing_runs" ("branch_id")
  WHERE "status" IN ('checking', 'queued', 'processing');

ALTER TABLE "branches"
  ADD COLUMN IF NOT EXISTS "incremental_indexing_enabled" boolean NOT NULL DEFAULT true;
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "incremental_paused_at" timestamp;
ALTER TABLE "branches"
  ADD COLUMN IF NOT EXISTS "incremental_paused_by" text REFERENCES "user"("id") ON DELETE SET NULL;
