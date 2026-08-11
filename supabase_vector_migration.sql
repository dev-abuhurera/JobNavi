-- ================================================================
-- Job Search Agent - Supabase pgvector Migration Script
-- Run this script in your Supabase SQL Editor to enable pgvector.
-- ================================================================

-- 1. Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add vector embedding columns to profiles and jobs tables
-- Using 384 dimensions matching Xenova/all-MiniLM-L6-v2 embeddings
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS resume_embedding vector(384);

ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS embedding vector(384);

-- 3. Create HNSW index on jobs embedding column for fast cosine distance searches
CREATE INDEX IF NOT EXISTS idx_jobs_embedding 
ON jobs USING hnsw (embedding vector_cosine_ops);

-- 4. RPC function to perform fast server-side vector similarity search for a candidate
CREATE OR REPLACE FUNCTION match_jobs_for_candidate(
  p_user_id UUID,
  p_threshold FLOAT DEFAULT 0.25,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id BIGINT,
  title TEXT,
  company TEXT,
  location TEXT,
  source TEXT,
  source_url TEXT,
  description TEXT,
  tech_stack JSONB,
  fit_score NUMERIC,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_embedding vector(384);
BEGIN
  -- Fetch candidate's stored resume embedding
  SELECT resume_embedding INTO v_embedding
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_embedding IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    j.id,
    j.title,
    j.company,
    j.location,
    j.source,
    j.source_url,
    j.description,
    j.tech_stack,
    j.fit_score,
    (1 - (j.embedding <=> v_embedding))::FLOAT AS similarity
  FROM jobs j
  WHERE j.user_id = p_user_id
    AND j.embedding IS NOT NULL
    AND (1 - (j.embedding <=> v_embedding)) >= p_threshold
  ORDER BY j.embedding <=> v_embedding ASC
  LIMIT p_limit;
END;
$$;
