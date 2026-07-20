import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = join(here, '../src/lib/procedures.js');
const outDir = join(here, '../src/data/procedures');
mkdirSync(outDir, { recursive: true });

const lines = readFileSync(srcPath, 'utf8').split(/\r?\n/);
const chunks = [
  { name: 'jamaica-ltd.js', start: 25, end: 354 },
  { name: 'us-de-llc.js', start: 355, end: 617 },
  { name: 'us-de-c-corp.js', start: 618, end: 886 },
  { name: 'us-wy-llc.js', start: 887, end: 1111 },
];

for (const c of chunks) {
  const body = lines.slice(c.start, c.end + 1).join('\n');
  const content = `import { legalTemplateUrl } from '../../lib/template-urls.js';\n\n${body}\n`;
  writeFileSync(join(outDir, c.name), content);
}

console.log(`Wrote ${chunks.length} procedure data files to ${outDir}`);
