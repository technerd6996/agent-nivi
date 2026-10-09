/**
 * Vector Store & Retrieval Engine for SRE Runbook Knowledge Base.
 *
 * Implements vector similarity search (cosine metric), storage in Supabase
 * (with resilient persistent local caching), development diagnostics, and
 * explicit configurable TOP_K retrieval.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  generateEmbedding,
  validateEmbeddingDimensions,
} from './embeddings';
import { fetchDocxBuffer, extractDocxText } from './docxExtractor';
import {
  chunkDocument,
  DocumentChunk,
  ParentDocument,
  CHUNKING_STRATEGY,
  SEMANTIC_TARGET_CHARS,
  SEMANTIC_OVERLAP_PARAGRAPHS,
} from './chunking';
import { getSupabaseServerClient } from './supabase';

// ============================================================================
// EXPLICIT CONFIGURABLE RETRIEVAL PARAMETERS
// ============================================================================
export const DEFAULT_TOP_K = 5;

const VECTOR_STORE_FILE = path.resolve(process.cwd(), 'src/data/vectorStore.json');

export interface ScoredChunk {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  chunkIndex: number;
  sectionTitle: string;
  similarityScore: number;
  chunkContent: string;
  source: string;
  metadata: Record<string, any>;
}

export interface RetrievalResult {
  query: string;
  embeddingModel: string;
  targetDimensions: number;
  numberRetrieved: number;
  topK: number;
  diagnostics: {
    latencyMs: number;
    totalChunksSearched: number;
  };
  results: ScoredChunk[];
}

export interface IngestionResult {
  success: boolean;
  document: ParentDocument;
  totalChunks: number;
  embeddingModel: string;
  dimensions: number;
  storedInSupabase: boolean;
  storedInLocalCache: boolean;
  durationMs: number;
}

/**
 * Computes cosine similarity between two numeric vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * In-memory index cache for instant queries.
 */
let memoryCache: { parentDoc: ParentDocument | null; chunks: DocumentChunk[] } | null = null;

export function loadVectorIndex(): { parentDoc: ParentDocument | null; chunks: DocumentChunk[] } {
  if (memoryCache && memoryCache.chunks.length > 0) {
    return memoryCache;
  }

  if (fs.existsSync(VECTOR_STORE_FILE)) {
    try {
      const raw = fs.readFileSync(VECTOR_STORE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.chunks) && parsed.chunks.length > 0) {
        memoryCache = parsed;
        return parsed;
      }
    } catch (e) {
      console.warn('[VectorStore] Failed to parse local vector index file:', e);
    }
  }

  return { parentDoc: null, chunks: [] };
}

export function saveVectorIndex(parentDoc: ParentDocument, chunks: DocumentChunk[]): void {
  memoryCache = { parentDoc, chunks };
  const dir = path.dirname(VECTOR_STORE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(VECTOR_STORE_FILE, JSON.stringify({ parentDoc, chunks }, null, 2), 'utf8');
  console.log(`[VectorStore] Saved ${chunks.length} chunks to persistent index: ${VECTOR_STORE_FILE}`);
}

/**
 * Complete document ingestion pipeline:
 * Supabase Storage DOCX -> Text Extraction -> Parent Document -> Chunking ->
 * Embedding with NV-Embed-v2 -> Storage (Supabase + Local Cache).
 */
export async function runIngestionPipeline(options: {
  bucketName?: string;
  fileName?: string;
  batchSize?: number;
  maxScenariosPerSection?: number;
} = {}): Promise<IngestionResult> {
  const startTime = performance.now();
  const bucketName = options.bucketName || 'Knowledge Documents';
  const fileName = options.fileName || 'L1_SRE_500000_Word_Runbook.docx';
  const batchSize = options.batchSize || 10;
  const maxScenariosPerSection = options.maxScenariosPerSection;

  console.log(`\n======================================================`);
  console.log(`[Ingestion] Starting SRE Runbook Ingestion Pipeline`);
  console.log(`- Storage Target:       Bucket: "${bucketName}", File: "${fileName}"`);
  console.log(`- Embedding Model:      ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS}-dim)`);
  console.log(`- Chunking Strategy:    ${CHUNKING_STRATEGY} (Target ~${SEMANTIC_TARGET_CHARS} chars)`);
  console.log(`- Semantic Overlap:     ${SEMANTIC_OVERLAP_PARAGRAPHS} boundary paragraph`);
  console.log(`======================================================\n`);

  // Step 1: Download/read document
  const { buffer, source } = await fetchDocxBuffer(bucketName, fileName);

  // Step 2: Extract DOCX text
  const extracted = extractDocxText(buffer, source);
  console.log(`[Ingestion] Extracted ${extracted.stats.totalSections} sections, ${extracted.stats.totalCharacters} chars.`);

  // Step 3: Create ONE parent document record & chunk the document semantically
  const { parentDoc, chunks } = chunkDocument(extracted.sections, {
    source,
  });
  console.log(`[Ingestion] Created parent document: "${parentDoc.title}" (${parentDoc.id})`);
  console.log(`[Ingestion] Generated ${chunks.length} cohesive semantic scenario chunks with semantic overlap.`);

  // Step 4: Generate embeddings using the SAME embedding model
  console.log(`[Ingestion] Generating ${EMBEDDING_DIMENSIONS}-d embeddings using ${EMBEDDING_MODEL}...`);
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (chunk) => {
        const vec = await generateEmbedding(chunk.chunk_content, { inputType: 'passage' });
        validateEmbeddingDimensions(vec, EMBEDDING_DIMENSIONS);
        chunk.embedding = vec;
      })
    );
    process.stdout.write(`\r[Ingestion] Embedded ${Math.min(i + batchSize, chunks.length)}/${chunks.length} chunks...`);
  }
  console.log('\n[Ingestion] All chunk embeddings generated and verified.');

  // Step 5: Store in Supabase (if online)
  let storedInSupabase = false;
  try {
    const supabase = getSupabaseServerClient();
    // 5a. Upsert parent document
    const { error: parentErr } = await supabase.from('documents').upsert({
      id: parentDoc.id,
      title: parentDoc.title,
      content: parentDoc.source,
      metadata: parentDoc.metadata,
    });
    if (!parentErr) {
      console.log('[Ingestion] Upserted parent document into Supabase "documents" table.');
    }

    // 5b. Upsert chunks
    const chunkRows = chunks.map((c) => ({
      id: c.id,
      document_id: c.document_id,
      title: c.title,
      source: c.source,
      chunk_index: c.chunk_index,
      chunk_content: c.chunk_content,
      embedding: c.embedding,
      metadata: c.metadata,
    }));

    const { error: chunkErr } = await supabase.from('document_chunks').upsert(chunkRows);
    if (!chunkErr) {
      storedInSupabase = true;
      console.log('[Ingestion] Upserted chunks into Supabase "document_chunks" table.');
    }
  } catch (err: any) {
    console.warn(`[Ingestion] Supabase storage sync note: ${err?.message || err}. Local persistent store active.`);
  }

  // Step 6: Store in persistent local cache
  saveVectorIndex(parentDoc, chunks);

  const durationMs = Math.round(performance.now() - startTime);
  console.log(`[Ingestion] Pipeline completed in ${durationMs} ms.\n`);

  return {
    success: true,
    document: parentDoc,
    totalChunks: chunks.length,
    embeddingModel: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    storedInSupabase,
    storedInLocalCache: true,
    durationMs,
  };
}

/**
 * Searches the vector store for the Top-K most relevant chunks using
 * the SAME embedding model and cosine similarity.
 */
export async function searchSimilarChunks(
  query: string,
  options: {
    topK?: number;
    model?: string;
  } = {}
): Promise<RetrievalResult> {
  const startTime = performance.now();
  const topK = options.topK ?? DEFAULT_TOP_K;

  // 1. Ensure index is loaded
  let { parentDoc, chunks } = loadVectorIndex();
  if (chunks.length === 0) {
    console.log('[VectorStore] Index empty, running automatic ingestion...');
    const ingestion = await runIngestionPipeline();
    parentDoc = ingestion.document;
    chunks = loadVectorIndex().chunks;
  }

  // 2. Generate embedding for user query using EXACT SAME embedding model
  const queryEmbedding = await generateEmbedding(query, {
    inputType: 'query',
    model: options.model,
  });
  validateEmbeddingDimensions(queryEmbedding, EMBEDDING_DIMENSIONS);

  // 3. Compute cosine similarity against all chunks
  const scored: ScoredChunk[] = chunks
    .filter((c) => Array.isArray(c.embedding) && c.embedding.length === EMBEDDING_DIMENSIONS)
    .map((c) => {
      const score = cosineSimilarity(queryEmbedding, c.embedding!);
      return {
        documentId: c.document_id,
        documentTitle: parentDoc?.title || c.title,
        chunkId: c.id,
        chunkIndex: c.chunk_index,
        sectionTitle: c.metadata?.section_title || c.title,
        similarityScore: Math.round(score * 10000) / 10000,
        chunkContent: c.chunk_content,
        source: c.source,
        metadata: c.metadata,
      };
    });

  // 4. Sort descending by similarity score and take Top-K
  scored.sort((a, b) => b.similarityScore - a.similarityScore);
  const topResults = scored.slice(0, topK);

  const latencyMs = Math.round(performance.now() - startTime);

  return {
    query,
    embeddingModel: EMBEDDING_MODEL,
    targetDimensions: EMBEDDING_DIMENSIONS,
    numberRetrieved: topResults.length,
    topK,
    diagnostics: {
      latencyMs,
      totalChunksSearched: scored.length,
    },
    results: topResults,
  };
}
