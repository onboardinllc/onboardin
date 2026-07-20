import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));

export function loadFixture(name) {
  const path = join(here, 'fixtures', `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8'));
}
