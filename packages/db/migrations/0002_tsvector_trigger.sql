-- JDW-39: Auto-populate chunks.search_vector from chunks.content on insert/update.
-- The GIN index on search_vector was already created in migration 0000.
-- This trigger keeps the tsvector column in sync without application-level code.

CREATE OR REPLACE TRIGGER chunks_search_vector_update
BEFORE INSERT OR UPDATE ON chunks
FOR EACH ROW EXECUTE FUNCTION
tsvector_update_trigger(search_vector, 'pg_catalog.english', content);
