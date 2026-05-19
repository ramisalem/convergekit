-- Switch embedding column from 1024-dim (voyage-code-3) to 768-dim (nomic-embed-code).
-- Drop HNSW index first — pgvector cannot alter vector dimensions in-place.
-- All existing embeddings are invalidated and will be regenerated on re-index.

DROP INDEX IF EXISTS chunks_embedding_hnsw_idx;

ALTER TABLE chunks DROP COLUMN embedding;
ALTER TABLE chunks ADD COLUMN embedding vector(768);

CREATE INDEX chunks_embedding_hnsw_idx ON chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
