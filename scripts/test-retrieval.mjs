import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);

require.extensions['.ts'] = (module, filename) => {
  const code = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  module._compile(js, filename);
};

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const match = line.match(/^\s*([A-Za-z_0-9]+)\s*=\s*(.*)?\s*$/);
    if (match && !match[1].startsWith('#')) {
      process.env[match[1]] = (match[2] || '').trim();
    }
  }
}

const { searchSimilarChunks, DEFAULT_TOP_K } = require('../src/lib/vectorStore.ts');
const { nvidiaChat } = require('../src/lib/nvidia.ts');

const TEST_QUERIES = [
  "My pod is CrashLoopBackOff but I don't have logs yet.",
  "My pod was terminated with OOMKilled and exit code 137.",
  "My service is returning HTTP 503.",
  "My pod is ImagePullBackOff.",
  "My application has high CPU but normal memory.",
  "DNS resolution is failing with NXDOMAIN.",
];

async function runTests() {
  console.log('================================================================================');
  console.log('🧪 VECTOR RETRIEVAL & NEMOTRON GROUNDING TEST SUITE');
  console.log(`Configured TOP_K: ${DEFAULT_TOP_K}`);
  console.log('================================================================================\n');

  for (let idx = 0; idx < TEST_QUERIES.length; idx++) {
    const query = TEST_QUERIES[idx];
    console.log(`\n================================================================================`);
    console.log(`TEST CASE ${idx + 1}: "${query}"`);
    console.log(`================================================================================`);

    const result = await searchSimilarChunks(query, { topK: DEFAULT_TOP_K });

    console.log('\n--- 🔬 DEVELOPMENT DIAGNOSTICS ---');
    console.log(`Query:                     "${result.query}"`);
    console.log(`Embedding Model:           ${result.embeddingModel}`);
    console.log(`Embedding Dimensions:      ${result.targetDimensions}`);
    console.log(`Number of Chunks:          ${result.numberRetrieved} (Top-${result.topK})`);
    console.log(`Search Latency:            ${result.diagnostics.latencyMs} ms`);
    console.log(`Total Chunks In Corpus:    ${result.diagnostics.totalChunksSearched}`);

    console.log('\n--- 📚 RETRIEVED CHUNKS ---');
    result.results.forEach((r, i) => {
      console.log(`\n[Rank ${i + 1}] Similarity: ${(r.similarityScore * 100).toFixed(2)}% | Chunk ID: ${r.chunkId} | Section: "${r.sectionTitle}"`);
      console.log(`Document: "${r.documentTitle}" (Source: ${r.source})`);
      console.log(`Content Snippet:\n${r.chunkContent.slice(0, 240)}...`);
    });

    // Send retrieved chunks to Nemotron
    console.log('\n--- 🤖 NEMOTRON GROUNDED REASONING ---');
    const apiKey = process.env.NVIDIA_API_KEY;
    if (apiKey) {
      const runbookContext = result.results
        .map((r, i) => `[Source ${i + 1}: ${r.sectionTitle}]\n${r.chunkContent}`)
        .join('\n\n---\n\n');

      const systemPrompt = `You are an expert SRE Incident Commander powered by NVIDIA Nemotron.
You diagnose incidents based strictly on the retrieved runbook context and user inquiry.

CRITICAL GROUNDING RULES:
1. Clearly distinguish between:
   - Observed Evidence (what the user actually stated or showed)
   - Missing Evidence (what data or logs are NOT yet provided)
   - Likely Cause (probable hypothesis from the runbook)
   - Confirmed Cause (only if evidence strictly proves it; otherwise state "Unconfirmed")
2. Do not claim OOMKilled unless the user evidence actually indicates OOMKilled or exit code 137. If the user does not have logs or exit codes, state that OOMKilled is unconfirmed.
3. Ground your triage strictly in the retrieved runbook chunks. Cite specific procedures and commands.
4. Keep the diagnosis sharp, structured, and engineering-grade.`;

      const aiResponse = await nvidiaChat({
        apiKey,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `User Incident Report: "${query}"\n\nRetrieved Runbook Context:\n${runbookContext}`,
          },
        ],
        temperature: 0.15,
        maxTokens: 500,
      });

      if (aiResponse.ok) {
        console.log(`Model Used: ${aiResponse.modelUsed}`);
        console.log(`Response:\n${aiResponse.content.trim()}`);
      } else {
        console.log(`NVIDIA API response note: ${aiResponse.lastError}`);
      }
    } else {
      console.log('NVIDIA_API_KEY not found in environment.');
    }
  }

  console.log('\n================================================================================');
  console.log('✅ ALL 6 VECTOR RETRIEVAL & GROUNDING TESTS COMPLETED');
  console.log('================================================================================\n');
}

runTests().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
