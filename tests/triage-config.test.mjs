import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const routePath = path.resolve(process.cwd(), 'src/app/api/triage/route.ts');
const routeSource = fs.readFileSync(routePath, 'utf8');
const nvidiaPath = path.resolve(process.cwd(), 'src/lib/nvidia.ts');
const nvidiaSource = fs.readFileSync(nvidiaPath, 'utf8');

test('triage route does not hardcode a default NVIDIA key', () => {
  assert.doesNotMatch(
    routeSource,
    /process\.env\.NVIDIA_API_KEY\s*\|\|\s*'nvapi-/,
    'Hardcoded NVIDIA key fallback should be removed to avoid slow, unnecessary external calls.'
  );
});

test('working NVIDIA models are attempted before the environment-selected model', () => {
  const preferredOrder = [
    'nvidia/nemotron-3.5-lightning-30b-a3b',
    'nvidia/nemotron-3-super-120b-a12b',
  ];
  const functionMatch = nvidiaSource.match(
    /export function getModelChain\(\): string\[\] \{([\s\S]*?)\n\}/
  );

  assert.ok(functionMatch, 'getModelChain should be defined.');
  const functionBody = functionMatch[1];
  const preferredPositions = preferredOrder.map(model => functionBody.indexOf(model));

  assert.ok(preferredPositions.every(position => position >= 0), 'Every preferred model should be present.');
  assert.ok(preferredPositions[0] < preferredPositions[1], 'Preferred models should be ordered by capability.');
  assert.match(
    functionBody,
    /\.\.\.preferred,\s*\n\s*\.\.\.\(configured && !preferred\.includes\(configured\) \? \[configured\] : \[\]\),/
  );
});
