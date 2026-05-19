CREATE TABLE "wiki_pages" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "repository_id"  uuid NOT NULL,
  "branch_id"      uuid NOT NULL,
  "slug"           text NOT NULL,
  "title"          text NOT NULL,
  "parent_slug"    text,
  "order_index"    integer DEFAULT 0 NOT NULL,
  "content"        text DEFAULT '' NOT NULL,
  "summary"        text,
  "status"         text DEFAULT 'pending' NOT NULL,
  "generated_at"   timestamp,
  "commit_sha"     text,
  "created_at"     timestamp DEFAULT now() NOT NULL,
  "updated_at"     timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "wiki_pages_repo_slug_unique" UNIQUE ("repository_id", "slug")
);
--> statement-breakpoint
ALTER TABLE "wiki_pages"
  ADD CONSTRAINT "wiki_pages_repository_id_fk"
  FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "wiki_pages"
  ADD CONSTRAINT "wiki_pages_branch_id_fk"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "wiki_pages_repo_idx"   ON "wiki_pages" ("repository_id");
--> statement-breakpoint
CREATE INDEX "wiki_pages_parent_idx" ON "wiki_pages" ("repository_id", "parent_slug");
