/**
 * One-time: build unencrypted Form 6 visual shell (empty appearances) for mobile autofill.
 * Upload to public-forms/coj/form-6-shell.pdf
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts } from '../src/vendor/pdf-lib.esm.min.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const creds = readFileSync(join(__dirname, '../../scaffolds/credentials.md'), 'utf8');
const serviceKey = creds.match(/\*\*Service role key[^*]*\*\*\s*(.+)/)?.[1]?.trim();
const baseUrl = creds.match(/\*\*Project URL:\*\*\s*(.+)/)?.[1]?.trim();

const TEMPLATE_URL = `${baseUrl}/storage/v1/object/public/public-forms/coj/form-6.pdf`;
const SHELL_PATH = 'coj/form-6-shell.pdf';

const tplRes = await fetch(TEMPLATE_URL);
const tplBytes = new Uint8Array(await tplRes.arrayBuffer());
const src = await PDFDocument.load(tplBytes, { ignoreEncryption: true });
const font = await src.embedFont(StandardFonts.Helvetica);
src.getForm().updateFieldAppearances(font);

const dst = await PDFDocument.create();
const copied = await dst.copyPages(src, src.getPageIndices());
copied.forEach((p) => dst.addPage(p));
const shellBytes = new Uint8Array(await dst.save({ useObjectStreams: false }));

const enc = shellBytes.some((_, i, a) => i <= a.length - 8
  && a[i] === 0x2f && a[i + 1] === 0x45 && a[i + 2] === 0x6e && a[i + 3] === 0x63);
console.log('shell bytes', shellBytes.byteLength, 'encrypted', enc, 'pages', dst.getPageCount());

const up = await fetch(`${baseUrl}/storage/v1/object/public-forms/${SHELL_PATH}`, {
  method: 'POST',
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/pdf',
    'x-upsert': 'true',
  },
  body: shellBytes,
});
console.log('upload', up.status, await up.text());