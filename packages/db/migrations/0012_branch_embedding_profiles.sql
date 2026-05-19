ALTER TABLE branches ADD COLUMN IF NOT EXISTS embedding_provider text;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS embedding_model text;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS embedding_dimensions integer;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS embedding_endpoint text;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS embedding_profile_captured_at timestamp;

ALTER TABLE chunks
  ALTER COLUMN embedding TYPE vector
  USING embedding::vector;

UPDATE branches b
SET
  embedding_provider = 'lmstudio',
  embedding_model = 'text-embedding-nomic-embed-code',
  embedding_dimensions = 3584,
  embedding_endpoint = 'http://localhost:1234/v1',
  embedding_profile_captured_at = COALESCE(b.last_indexed_at, NOW())
WHERE
  b.embedding_provider IS NULL
  AND EXISTS (
    SELECT 1
    FROM documents d
    WHERE d.branch_id = b.id
  );
