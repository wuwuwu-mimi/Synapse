CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID PRIMARY KEY,
  session_id TEXT,
  source_path TEXT NOT NULL,
  title TEXT NOT NULL,
  snippet TEXT NOT NULL,
  search_text TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(64) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_search_text
  ON knowledge_chunks
  USING GIN (to_tsvector('simple', search_text));

CREATE INDEX IF NOT EXISTS idx_knowledge_embedding
  ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE TABLE IF NOT EXISTS memory_facts (
  id UUID PRIMARY KEY,
  session_id TEXT NOT NULL,
  fact TEXT NOT NULL,
  confidence NUMERIC(4, 3) NOT NULL DEFAULT 0.750,
  embedding VECTOR(64) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_facts_session
  ON memory_facts (session_id, created_at DESC);
