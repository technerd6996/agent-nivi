import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);

// Register .ts loader for Node CommonJS require
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

async function main() {
  console.log('🚀 Running SRE Runbook Document Ingestion Pipeline...');
  
  const { runIngestionPipeline } = require('../src/lib/vectorStore.ts');
  const result = await runIngestionPipeline({
    bucketName: 'Knowledge Documents',
    fileName: 'L1_SRE_500000_Word_Runbook.docx',
    batchSize: 10,
  });

  console.log('\n================ INGESTION SUMMARY ================');
  console.log('Document ID:          ', result.document.id);
  console.log('Document Title:       ', result.document.title);
  console.log('Source:               ', result.document.source);
  console.log('Total Chunks Created: ', result.totalChunks);
  console.log('Embedding Model Used: ', result.embeddingModel);
  console.log('Vector Dimensions:    ', result.dimensions);
  console.log('Duration:             ', `${result.durationMs} ms`);
  console.log('Local Index Saved:    ', result.storedInLocalCache);
  console.log('===================================================\n');
}

main().catch((err) => {
  console.error('\n❌ Ingestion failed:', err);
  process.exit(1);
});
