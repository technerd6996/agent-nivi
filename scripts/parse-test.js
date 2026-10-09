const fs = require('fs');
const xml = fs.readFileSync('word/document.xml', 'utf8');
console.log('XML size in KB:', Math.round(xml.length / 1024));

const pBlocks = xml.split('</w:p>');
const paragraphs = [];
for (const p of pBlocks) {
  const textRuns = [];
  const regex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let match;
  while ((match = regex.exec(p)) !== null) {
    textRuns.push(match[1]);
  }
  const text = textRuns.join('').trim();
  if (text) {
    paragraphs.push(text);
  }
}

console.log('Total non-empty paragraphs:', paragraphs.length);
console.log('Total characters:', paragraphs.reduce((a, b) => a + b.length, 0));
console.log('\n--- First 10 Paragraphs ---');
paragraphs.slice(0, 10).forEach((p, i) => console.log((i+1) + ': ' + p));

console.log('\n--- Checking topics in document ---');
const docText = paragraphs.join('\n');
const topics = [
  'CrashLoopBackOff',
  'OOMKilled',
  '137',
  '503',
  'ImagePullBackOff',
  'CPU',
  'NXDOMAIN',
  'DNS'
];
topics.forEach(t => {
  const count = (docText.match(new RegExp(t, 'gi')) || []).length;
  console.log(t + ' occurrences:', count);
});
