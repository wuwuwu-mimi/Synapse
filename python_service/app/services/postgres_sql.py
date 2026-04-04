BOOTSTRAP_SQL = """
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

ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS snippet TEXT NOT NULL DEFAULT '';

ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS search_text TEXT NOT NULL DEFAULT '';

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
""".strip()

HYBRID_SEARCH_SQL = """
WITH keyword_hits AS (
  SELECT
    id,
    source_path,
    title,
    snippet,
    content,
    ts_rank_cd(
      to_tsvector('simple', search_text),
      websearch_to_tsquery('simple', %(query_search)s)
    ) AS lexical_score,
    ROW_NUMBER() OVER (
      ORDER BY ts_rank_cd(
        to_tsvector('simple', search_text),
        websearch_to_tsquery('simple', %(query_search)s)
      ) DESC
    ) AS lexical_rank
  FROM knowledge_chunks
  WHERE session_id IS NULL
    AND (%(source_prefix)s = '' OR source_path LIKE %(source_like)s)
    AND to_tsvector('simple', search_text) @@ websearch_to_tsquery('simple', %(query_search)s)
  ORDER BY lexical_score DESC
  LIMIT %(candidate_k)s
),
vector_hits AS (
  SELECT
    id,
    source_path,
    title,
    snippet,
    content,
    GREATEST(0.0, 1 - (embedding <=> %(embedding)s::vector)) AS vector_score,
    ROW_NUMBER() OVER (
      ORDER BY embedding <=> %(embedding)s::vector
    ) AS vector_rank
  FROM knowledge_chunks
  WHERE session_id IS NULL
    AND (%(source_prefix)s = '' OR source_path LIKE %(source_like)s)
  ORDER BY embedding <=> %(embedding)s::vector
  LIMIT %(candidate_k)s
),
fused AS (
  SELECT
    COALESCE(k.id, v.id) AS id,
    COALESCE(k.source_path, v.source_path) AS source_path,
    COALESCE(k.title, v.title) AS title,
    COALESCE(k.snippet, v.snippet) AS snippet,
    COALESCE(k.content, v.content) AS content,
    COALESCE(k.lexical_score, 0) AS lexical_score,
    COALESCE(v.vector_score, 0) AS vector_score,
    (COALESCE(k.lexical_score, 0) * 0.45) +
    (GREATEST(COALESCE(v.vector_score, 0), 0) * 0.55) AS fused_score,
    COALESCE(1.0 / (60 + k.lexical_rank), 0) +
    COALESCE(1.0 / (60 + v.vector_rank), 0) AS rrf_score
  FROM keyword_hits k
  FULL OUTER JOIN vector_hits v ON k.id = v.id
)
SELECT
  id,
  source_path,
  title,
  snippet,
  content,
  lexical_score,
  vector_score,
  fused_score
FROM fused
ORDER BY fused_score DESC, rrf_score DESC, vector_score DESC, lexical_score DESC
LIMIT %(candidate_k)s;
""".strip()
