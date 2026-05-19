-- JDW-41: HNSW index for pgvector cosine-similarity search on chunk embeddings.
-- The vector extension is already enabled in migration 0000.
-- m=16 and ef_construction=64 are the recommended starting defaults for code search.

CREATE INDEX chunks_embedding_hnsw_idx ON chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
