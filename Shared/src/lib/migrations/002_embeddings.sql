-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Note embeddings table
CREATE TABLE IF NOT EXISTS note_embeddings (
  note_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  embedding vector(1536),  -- OpenAI text-embedding-3-small dimension
  content_hash TEXT,
  updated_at BIGINT,
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Index for fast similarity search
CREATE INDEX IF NOT EXISTS note_embeddings_user_idx ON note_embeddings(user_id);

-- RPC function: match notes by query embedding
CREATE OR REPLACE FUNCTION match_notes(
  query_embedding vector(1536),
  match_user_id TEXT,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  note_id TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ne.note_id,
    1 - (ne.embedding <=> query_embedding) AS similarity
  FROM note_embeddings ne
  WHERE ne.user_id = match_user_id
  ORDER BY ne.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- RPC function: find similar notes to a given note
CREATE OR REPLACE FUNCTION find_similar_notes(
  target_note_id TEXT,
  match_user_id TEXT,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  note_id TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
DECLARE
  target_embedding vector(1536);
BEGIN
  SELECT embedding INTO target_embedding
  FROM note_embeddings
  WHERE note_embeddings.note_id = target_note_id;

  IF target_embedding IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ne.note_id,
    1 - (ne.embedding <=> target_embedding) AS similarity
  FROM note_embeddings ne
  WHERE ne.user_id = match_user_id
    AND ne.note_id != target_note_id
  ORDER BY ne.embedding <=> target_embedding
  LIMIT match_count;
END;
$$;

-- Row Level Security
ALTER TABLE note_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own embeddings"
  ON note_embeddings
  FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);
