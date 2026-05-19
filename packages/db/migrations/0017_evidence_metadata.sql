ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "evidence_tier" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "evidence_kind" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "search_by_default" boolean;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "index_decision_reason" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "last_verified_against_code_at" timestamp;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "verified_against_commit_sha" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "evidence_alignment_status" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "linked_code_paths" text[];
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "linked_code_content_hashes" jsonb;

ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "indexed_commit_sha" text;

CREATE INDEX IF NOT EXISTS "documents_evidence_tier_idx" ON "documents" ("evidence_tier");
CREATE INDEX IF NOT EXISTS "documents_evidence_kind_idx" ON "documents" ("evidence_kind");
CREATE INDEX IF NOT EXISTS "documents_branch_evidence_tier_idx" ON "documents" ("branch_id", "evidence_tier");
