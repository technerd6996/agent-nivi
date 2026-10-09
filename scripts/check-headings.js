const fs = require('fs');
const xml = fs.readFileSync('word/document.xml', 'utf8');
const pBlocks = xml.split('</w:p>');
const headings = [];
for (const p of pBlocks) {
  if (p.includes('Heading') || p.includes('Title')) {
    const textRuns = [];
    const regex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let match;
    while ((match = regex.exec(p)) !== null) textRuns.push(match[1]);
    const text = textRuns.join('').trim();
    if (text) headings.push(text);
  }
}
console.log('Total headings found:', headings.length);
console.log('Sample headings:', headings.slice(0, 30));
