/**
 * NVIDIA Embedding Client using NVIDIA NV-Embed-v2.
 *
 * Connects to NVIDIA API Catalog / NIM endpoints for the flagship
 * nvidia/nv-embed-v2 model (4096 dimensions), with resilient cascading
 * to fallback NVIDIA embedding models if needed.
 */

export const EMBEDDING_MODEL = 'nvidia/nv-embed-v2';
export const EMBEDDING_DIMENSIONS = 4096;

/**
 * Embedding model cascade chain in preference order:
 * 1. nvidia/nv-embed-v2 (NVIDIA NV-Embed-v2, 4096-dim)
 * 2. nvidia/nv-embedqa-mistral-7b-v2 (NVIDIA Mistral-7B QA Embed v2)
 * 3. nvidia/nemotron-3-embed-1b (NVIDIA Nemotron 3 Embed 1B)
 * 4. nvidia/llama-nemotron-embed-vl-1b-v2 (NVIDIA Llama Nemotron Embed VL 1B v2)
 */
export const EMBEDDING_MODEL_CHAIN = [
  'nvidia/nv-embed-v2',
  'nvidia/nv-embedqa-mistral-7b-v2',
  'nvidia/nemotron-3-embed-1b',
  'nvidia/llama-nemotron-embed-vl-1b-v2',
];

const DEFAULT_API_KEY = process.env.NVIDIA_API_KEY || '';
const NVIDIA_EMBEDDING_API_URL = process.env.NVIDIA_EMBEDDING_API_URL || 'https://integrate.api.nvidia.com/v1/embeddings';

export interface GenerateEmbeddingOptions {
  inputType?: 'passage' | 'query';
  model?: string;
  apiKey?: string;
  apiUrl?: string;
}

/**
 * Fits vector dimensions to the target dimension (4096 for NV-Embed-v2).
 * Truncates if larger, or zero-pads if a fallback model returns fewer dimensions.
 */
function fitDimensions(vector: number[], targetDim: number = EMBEDDING_DIMENSIONS): number[] {
  if (vector.length === targetDim) {
    return vector;
  }
  if (vector.length > targetDim) {
    return vector.slice(0, targetDim);
  }
  return vector.concat(new Array(targetDim - vector.length).fill(0));
}

/**
 * Generates an embedding vector using NVIDIA NV-Embed-v2.
 * Automatically tries nvidia/nv-embed-v2 first, cascading through
 * available NVIDIA NIM endpoints if needed.
 */
export async function generateEmbedding(
  text: string,
  options: GenerateEmbeddingOptions = {}
): Promise<number[]> {
  const cleanText = (text ?? '').trim();

  if (!cleanText) {
    return Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  }

  const apiKey = options.apiKey || process.env.NVIDIA_API_KEY || DEFAULT_API_KEY;
  const apiUrl = options.apiUrl || NVIDIA_EMBEDDING_API_URL;
  const inputType = options.inputType || 'passage';

  if (!apiKey) {
    throw new Error('NVIDIA API key is required to generate embeddings. Set NVIDIA_API_KEY in your environment or .env.local.');
  }

  const configuredModel = options.model || process.env.NVIDIA_EMBEDDING_MODEL;
  const modelsToTry = [
    ...(configuredModel ? [configuredModel] : []),
    ...EMBEDDING_MODEL_CHAIN.filter(m => m !== configuredModel),
  ];

  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: [cleanText],
          input_type: inputType,
          encoding_format: 'float',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        lastError = new Error(`NVIDIA embedding API returned status ${response.status} for model ${model}: ${errorText.slice(0, 200)}`);
        continue;
      }

      const data = await response.json();
      const rawVector = data?.data?.[0]?.embedding;

      if (!rawVector || !Array.isArray(rawVector) || rawVector.length === 0) {
        lastError = new Error(`NVIDIA embedding API returned empty vector for model ${model}`);
        continue;
      }

      const numbers = rawVector.map((val: any) => Number(val));
      return fitDimensions(numbers, EMBEDDING_DIMENSIONS);
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(`Failed to generate embedding with NVIDIA NV-Embed-v2: ${lastError?.message || 'Unknown error'}`);
}

export function validateEmbeddingDimensions(
  vector: number[],
  expected: number = EMBEDDING_DIMENSIONS
): number {
  if (vector.length !== expected) {
    throw new Error(`Expected embedding dimension count ${expected}, received ${vector.length}.`);
  }

  return vector.length;
}
