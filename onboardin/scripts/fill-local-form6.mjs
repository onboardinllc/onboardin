/**
 * Download Form 6 → fill with PyMuPDF (AcroForm names, like Acrobat) → review → optional upload.
 *
 * Usage:
 *   node scripts/fill-local-form6.mjs --open
 *   node scripts/fill-local-form6.mjs --upload
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';
import { resolveEntityFacts, resolveCojFieldValues } from '../src/lib/company-context.js';
import { fillCojPdfWithMupdf } from './coj-mupdf-bridge.mjs';
import { workingCopyCanonicalPath } from '../src/lib/coj-formation-packet.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'local-output');
const DOWNLOADED = join(OUT_DIR, 'form-6-downloaded.pdf');
const FILLED = join(OUT_DIR, 'form-6-filled.pdf');

const creds = readFileSync(join(__dirname, '../../scaffolds/credentials.md'), 'utf8');
const serviceKey = creds.match(/\*\*Service role key[^*]*\*\*\s*(.+)/)?.[1]?.trim();
const baseUrl = creds.match(/\*\*Project URL:\*\*\s*(.+)/)?.[1]?.trim();

const args = process.argv.slice(2);
const openAfter = args.includes('--open');
const doUpload = args.includes('--upload');
const clientIdx = args.indexOf('--client');
const clientId = clientIdx >= 0 ? args[clientIdx + 1] : '12516ae7-64af-49df-8ac2-eea7367077b3';

function rest(path) {
  return fetch(`${baseUrl}/rest/v1/${path}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  }).then((r) => {
    if (!r.ok) throw new Error(`REST ${path}: ${r.status}`);
    return r.json();
  });
}

function verifyVisibleText(pdfPath, fieldValues) {
  const checks = [
    fieldValues.proposed_company_name,
    fieldValues.applicant_name,
    fieldValues.applicant_address?.split(',')[0],
    '24', '06',
  ].filter(Boolean);
  const py = spawnSync('python', ['-c', `
import fitz, sys, json
d = fitz.open(sys.argv[1])
t = d[0].get_text()
d.close()
checks = json.loads(sys.argv[2])
ok = all(c in t for c in checks)
print('VISIBLE_OK' if ok else 'VISIBLE_FAIL')
for c in checks:
    print(('OK  ' if c in t else 'MISS'), c)
`, pdfPath, JSON.stringify(checks)], { encoding: 'utf8' });
  const ok = py.stdout?.includes('VISIBLE_OK');
  return { ok, output: py.stdout || py.stderr };
}

mkdirSync(OUT_DIR, { recursive: true });

console.log('\n=== Form 6: download → PyMuPDF fill (AcroForm names) ===\n');

const templateUrl = `${baseUrl}/storage/v1/object/public/public-forms/coj/form-6.pdf`;
const dlRes = await fetch(templateUrl);
if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`);
const downloadedBytes = new Uint8Array(await dlRes.arrayBuffer());
writeFileSync(DOWNLOADED, downloadedBytes);
console.log('Downloaded', DOWNLOADED, downloadedBytes.byteLength, 'bytes');

const [clients, templates] = await Promise.all([
  rest(`clients?id=eq.${clientId}&select=id,formation_draft,entity_profile,founder_name,company_name`),
  rest(`legal_templates?kind=eq.coj_form_6&provider=eq.coj&select=field_map,placeholder_map`),
]);
const client = clients?.[0];
const template = templates?.[0];
if (!client || !template) throw new Error('Client or template not found');

const formationDraft = typeof client.formation_draft === 'string'
  ? JSON.parse(client.formation_draft || '{}')
  : (client.formation_draft ?? {});

const fieldValues = resolveCojFieldValues(template, resolveEntityFacts({
  client,
  entityProfile: client.entity_profile ?? {},
  formationDraft,
  complianceIntake: {},
}));
console.log('field_values', JSON.stringify(fieldValues, null, 2));

const templateBytes = new Uint8Array(readFileSync(DOWNLOADED));
const { pdfBytes, filledCount } = fillCojPdfWithMupdf({
  templatePdfBytes: templateBytes,
  formKind: 'coj_form_6',
  fieldValues,
  fieldMap: template.field_map ?? {},
});
writeFileSync(FILLED, pdfBytes);
console.log('Filled', FILLED, pdfBytes.byteLength, 'bytes, count', filledCount);

const vis = verifyVisibleText(FILLED, fieldValues);
console.log('Visible text check:', vis.ok ? 'PASS' : 'FAIL');
if (!vis.ok || filledCount === 0) {
  console.log(vis.output);
  process.exit(1);
}

if (doUpload) {
  const storagePath = workingCopyCanonicalPath(clientId, 'coj_form_6');
  await fetch(`${baseUrl}/storage/v1/object/client-documents/${storagePath}`, {
    method: 'DELETE',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  }).catch(() => {});
  const up = await fetch(`${baseUrl}/storage/v1/object/client-documents/${storagePath}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/pdf',
      'x-upsert': 'true',
    },
    body: pdfBytes,
  });
  console.log('Upload', up.status, (await up.text()).slice(0, 100));
  if (!up.ok) process.exit(1);
}

console.log('\nDone —', FILLED);
if (openAfter || !doUpload) {
  execSync(`powershell -Command "Start-Process -FilePath '${FILLED.replace(/'/g, "''")}'"`, { stdio: 'ignore' });
}