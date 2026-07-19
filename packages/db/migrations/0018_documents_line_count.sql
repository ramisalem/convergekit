-- Materialize per-document line counts so repository metrics (e.g. the
-- repository-list LOC aggregate) sum a stored integer instead of recomputing
-- line counts from full file contents on every read.
--
-- Definition: number of newline characters, plus one for a final line that has
-- no trailing newline; empty content counts as 0 lines.
--
-- NOTE: this is a STORED generated column, so adding it rewrites the
-- "documents" table once under an ACCESS EXCLUSIVE lock (duration scales with
-- row count and content size).
ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "line_count" integer NOT NULL
  GENERATED ALWAYS AS (
    (length("content") - length(replace("content", chr(10), ''))) +
    (case when "content" = '' then 0 when right("content", 1) = chr(10) then 0 else 1 end)
  ) STORED;
