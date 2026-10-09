import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Load .env.local if present
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

// Transpile and load src/lib/embeddings.ts
const embeddingsPath = path.resolve(process.cwd(), 'src/lib/embeddings.ts');
const code = fs.readFileSync(embeddingsPath, 'utf8');
const js = ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const mod = { exports: {} };
const runner = new Function('module', 'exports', 'process', js);
runner(mod, mod.exports, process);

const { generateEmbedding, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } = mod.exports;

async function main() {
  const text = process.argv.slice(2).join(' ') || 
    'Incident Report: Production Ingress 504 Gateway Timeout caused by upstream thread pool exhaustion and unindexed DB queries.';

  console.log('----------------------------------------------------');
  console.log('🤖 Model:              ', EMBEDDING_MODEL);
  console.log('📏 Target Dimensions:  ', EMBEDDING_DIMENSIONS);
  console.log('📝 Input Text:        ', text);
  console.log('----------------------------------------------------');
  console.log('⏳ Generating embedding vector...');

  const start = performance.now();
  const vector = await generateEmbedding(text, { inputType: 'passage' });
  const latency = Math.round(performance.now() - start);

  console.log('\n✅ Successfully generated embedding!');
  console.log('⏱️  Latency:            ', `${latency} ms`);
  console.log('📊 Vector Length:      ', vector.length);
  console.log('🔍 First 8 Elements:   ', JSON.stringify(vector.slice(0, 8)));
  console.log('📈 Min Value:          ', Math.min(...vector));
  console.log('📉 Max Value:          ', Math.max(...vector));

  const l2Norm = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0));
  console.log('⚖️  L2 Norm (length):   ', l2Norm.toFixed(6));
  console.log('----------------------------------------------------');
}

main().catch((err) => {
  console.error('\n❌ Execution failed:', err);
  process.exit(1);
});
