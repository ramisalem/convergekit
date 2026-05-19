-- Add source_files column to wiki_pages to track which source files were used to generate each page
ALTER TABLE "wiki_pages" ADD COLUMN IF NOT EXISTS "source_files" text[];
