-- ============================================================================
-- Supabase Migration: SRE Runbook RAG & Vector Search Schema
-- Matches NVIDIA NV-Embed-v2 (4096 dimensions)
-- ============================================================================

-- 1. Enable the pgvector extension to work with embedding vectors
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create the parent documents table
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create the document chunks table with 4096-dimensional vector column
CREATE TABLE IF NOT EXISTS document_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_content TEXT NOT NULL,
  embedding VECTOR(4096),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create an index on the document_id foreign key
CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_id ON document_chunks(document_id);

-- 5. Create an HNSW index on the 4096-dimensional embedding column for fast cosine distance search
-- (Note: HNSW supports up to 4096 dimensions in pgvector 0.5.0+)
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding 
ON document_chunks 
USING hnsw (embedding vector_cosine_ops);

-- 6. RPC Function for Vector Similarity Search with Top-K
CREATE OR REPLACE FUNCTION match_document_chunks (
  query_embedding VECTOR(4096),
  match_count INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.0
)
RETURNS TABLE (
  id TEXT,
  document_id TEXT,
  title TEXT,
  source TEXT,
  chunk_index INT,
  chunk_content TEXT,
  similarity FLOAT,
  metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.title,
    dc.source,
    dc.chunk_index,
    dc.chunk_content,
    1 - (dc.embedding <=> query_embedding) AS similarity,
    dc.metadata
  FROM document_chunks dc
  WHERE 1 - (dc.embedding <=> query_embedding) > similarity_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
