import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Load and transpile src/lib/embeddings.ts
const embeddingsPath = path.resolve(process.cwd(), 'src/lib/embeddings.ts');
const embeddingsSource = fs.readFileSync(embeddingsPath, 'utf8');

const transpiled = ts.transpileModule(embeddingsSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const mod = { exports: {} };
const runner = new Function('module', 'exports', 'process', transpiled);
runner(mod, mod.exports, process);

const {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL_CHAIN,
  validateEmbeddingDimensions,
  generateEmbedding,
} = mod.exports;

test('EMBEDDING_MODEL is configured to nvidia/nv-embed-v2', () => {
  assert.equal(EMBEDDING_MODEL, 'nvidia/nv-embed-v2');
});

test('EMBEDDING_DIMENSIONS is configured to 4096 for NV-Embed-v2', () => {
  assert.equal(EMBEDDING_DIMENSIONS, 4096);
});

test('EMBEDDING_MODEL_CHAIN prioritizes nvidia/nv-embed-v2', () => {
  assert.ok(Array.isArray(EMBEDDING_MODEL_CHAIN));
  assert.equal(EMBEDDING_MODEL_CHAIN[0], 'nvidia/nv-embed-v2');
});

test('validateEmbeddingDimensions passes on 4096 dimensions and fails on mismatch', () => {
  const validVector = new Array(4096).fill(0.01);
  assert.equal(validateEmbeddingDimensions(validVector), 4096);

  const invalidVector = new Array(384).fill(0.01);
  assert.throws(
    () => validateEmbeddingDimensions(invalidVector),
    /Expected embedding dimension count 4096, received 384/
  );
});

test('generateEmbedding with empty text returns 4096-dimensional zero vector', async () => {
  const vector = await generateEmbedding('');
  assert.equal(vector.length, 4096);
  assert.ok(vector.every(val => val === 0));
});

test('generateEmbedding produces a 4096-dimensional embedding vector via NVIDIA API', async () => {
  const apiKey = process.env.NVIDIA_API_KEY || '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';
  const vector = await generateEmbedding('Kubernetes Pod CrashLoopBackOff Exit Code 137 OOMKilled', {
    apiKey,
    inputType: 'passage',
  });
  assert.equal(vector.length, 4096);
  assert.equal(typeof vector[0], 'number');
  assert.ok(!Number.isNaN(vector[0]));
});
