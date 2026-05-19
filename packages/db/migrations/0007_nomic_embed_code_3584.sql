-- Resize embedding column from 768 → 3584 to match text-embedding-nomic-embed-code output from LM Studio
-- Note: pgvector HNSW supports a maximum of 2000 dimensions. At 3584 dims we cannot use HNSW.
-- Similarity search falls back to a sequential scan (fine for small repos).
-- When switching to a ≤2000-dim model, recreate the HNSW index with:
--   CREATE INDEX chunks_embedding_hnsw_idx ON chunks
--   USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
DROP INDEX IF EXISTS chunks_embedding_hnsw_idx;

ALTER TABLE chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE chunks ADD COLUMN embedding vector(3584);
