/**
 * Node bridge: fill COJ PDF via PyMuPDF (visible fill, not pdf-lib).
 */
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { cojPdfFieldNameValues } from '../src/lib/coj-acro-field-names.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON_SCRIPT = join(__dirname, 'coj-fill-mupdf.py');

function pythonCmd() {
  const tryCmds = ['python', 'python3', 'py'];
  for (const cmd of tryCmds) {
    const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return cmd;
  }
  throw new Error('Python 3 + PyMuPDF (pip install pymupdf) required for COJ fill.');
}

/**
 * @param {{
 *   templatePdfBytes: Uint8Array,
 *   formKind: string,
 *   fieldValues: Record<string, string>,
 *   fieldMap?: Record<string, object>,
 * }} opts
 */
export function fillCojPdfWithMupdf({ templatePdfBytes, formKind, fieldValues, fieldMap = {} }) {
  const pdfNames = cojPdfFieldNameValues(formKind, fieldValues, fieldMap);
  if (!Object.keys(pdfNames).length) {
    return { pdfBytes: templatePdfBytes, filledCount: 0 };
  }

  const dir = mkdtempSync(join(tmpdir(), 'coj-fill-'));
  const inPath = join(dir, 'in.pdf');
  const outPath = join(dir, 'out.pdf');
  writeFileSync(inPath, templatePdfBytes);

  const valuesPath = join(dir, 'values.json');
  writeFileSync(valuesPath, JSON.stringify(pdfNames), 'utf8');

  const py = pythonCmd();
  const result = spawnSync(
    py,
    [PYTHON_SCRIPT, inPath, outPath, '--values-file', valuesPath],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || 'PyMuPDF fill failed');
  }

  let meta;
  try {
    meta = JSON.parse(result.stdout.trim().split('\n').pop());
  } catch {
    meta = { filledCount: 0 };
  }

  const pdfBytes = new Uint8Array(readFileSync(outPath));
  return { pdfBytes, filledCount: meta.filledCount ?? 0 };
}