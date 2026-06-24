/**
 * Local COJ autofill dry-run - no vault upload.
 * Pulls live client + template from Supabase, runs the same fill pipeline as the app,
 * writes PDFs to scripts/local-output/ for visual review.
 *
 * Usage:
 *   node scripts/test-coj-autofill-local.mjs
 *   node scripts/test-coj-autofill-local.mjs --client <uuid> --form coj_form_6
 *   node scripts/test-coj-autofill-local.mjs --open
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { inflateSync } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { PDFDocument } from '../src/vendor/pdf-lib.esm.min.js';
import { resolveEntityFacts, resolveCojFieldValues } from '../src/lib/company-context.js';
import { buildCojFilledPdf } from './pdf-fill-node.mjs';
import { clearForm6ShellCache } from '../src/lib/coj-pdf-fill.js';
import { workingCopyCanonicalPath } from '../src/lib/coj-formation-packet.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'local-output');

const creds = readFileSync(join(__dirname, '../../scaffolds/credentials.md'), 'utf8');
const serviceKey = creds.match(/\*\*Service role key[^*]*\*\*\s*(.+)/)?.[1]?.trim();
const baseUrl = creds.match(/\*\*Project URL:\*\*\s*(.+)/)?.[1]?.trim();

const args = process.argv.slice(2);
const openAfter = args.includes('--open');
const clientIdx = args.indexOf('--client');
const formIdx = args.indexOf('--form');
const clientId = clientIdx >= 0 ? args[clientIdx + 1] : '12516ae7-64af-49df-8ac2-eea7367077b3';
const formKind = formIdx >= 0 ? args[formIdx + 1] : 'coj_form_6';

function rest(path) {
  return fetch(`${baseUrl}/rest/v1/${path}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  }).then((r) => {
    if (!r.ok) throw new Error(`REST ${path}: ${r.status}`);
    return r.json();
  });
}

function bytesIncludeLatin(bytes, text) {
  const latin = Buffer.from(bytes).toString('latin1');
  return latin.includes(text);
}

/** Decode PDF hex strings <414243> and literal (ABC) from content streams. */
function extractPaintedStrings(pdfBytes) {
  const raw = Buffer.from(pdfBytes).toString('latin1');
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const found = new Set();
  let m;
  while ((m = streamRe.exec(raw)) !== null) {
    let text;
    try {
      text = inflateSync(Buffer.from(m[1], 'binary')).toString('latin1');
    } catch {
      continue;
    }
    for (const hex of text.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      const chars = hex[1].match(/.{1,2}/g) || [];
      found.add(chars.map((h) => String.fromCharCode(parseInt(h, 16))).join(''));
    }
    for (const lit of text.matchAll(/\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/g)) {
      found.add(lit[1].replace(/\\(.)/g, '$1'));
    }
  }
  return [...found].filter(Boolean);
}

async function fetchTemplateBytes(templatePath) {
  const res = await fetch(templatePath);
  if (!res.ok) throw new Error(`Template fetch failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function probePdf(label, bytes) {
  const enc = bytesIncludeLatin(bytes, '/Encrypt');
  let pages = 0;
  let fields = 0;
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    pages = doc.getPageCount();
    fields = doc.getForm().getFields().length;
  } catch (e) {
    console.log(`  ${label}: load error ${e.message}`);
    return;
  }
  console.log(`  ${label}: ${bytes.byteLength} bytes | encrypted=${enc} | pages=${pages} | acroFields=${fields}`);
}

mkdirSync(OUT_DIR, { recursive: true });
clearForm6ShellCache();

console.log('\n=== COJ autofill local dry-run (no upload) ===\n');
console.log('client', clientId);
console.log('form  ', formKind);

const clients = await rest(
  `clients?id=eq.${clientId}&select=id,company_name,founder_name,jurisdiction,country,entity_type,formation_draft,entity_profile`,
);
const client = clients?.[0];
if (!client) throw new Error('Client not found');

const templates = await rest(
  `legal_templates?kind=eq.${formKind}&provider=eq.coj&select=id,kind,label,template_path,placeholder_map,field_map`,
);
const template = templates?.[0];
if (!template) throw new Error('Template not found');

console.log('\n--- DB inputs ---');
console.log('company_name   ', client.company_name);
console.log('founder_name   ', client.founder_name);
console.log('formation_draft', JSON.stringify(client.formation_draft ?? {}, null, 2).slice(0, 500));
console.log('entity_profile ', JSON.stringify(client.entity_profile ?? {}, null, 2).slice(0, 300));
console.log('field_map keys ', Object.keys(template.field_map ?? {}).join(', '));

const formationDraft = typeof client.formation_draft === 'string'
  ? JSON.parse(client.formation_draft || '{}')
  : (client.formation_draft ?? {});

const context = resolveEntityFacts({
  client,
  entityProfile: client.entity_profile ?? {},
  formationDraft,
  complianceIntake: {},
});
const fieldValues = resolveCojFieldValues(template, context);

console.log('\n--- Resolved field_values ---');
console.log(JSON.stringify(fieldValues, null, 2));

const templateBytes = await fetchTemplateBytes(template.template_path);
const shellRes = await fetch('https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-6-shell.pdf');
const shellOk = shellRes.ok;
const shellBytes = shellOk ? new Uint8Array(await shellRes.arrayBuffer()) : null;
console.log('\n--- Assets ---');
console.log('template', template.template_path, templateBytes.byteLength, 'bytes');
console.log('shell   ', shellOk ? `OK ${shellBytes.byteLength} bytes` : `FAIL ${shellRes.status}`);

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const filledPath = join(OUT_DIR, `${formKind}-filled-${stamp}.pdf`);
const shellPath = join(OUT_DIR, `form-6-shell-snapshot.pdf`);
const templatePath = join(OUT_DIR, `form-6-template-snapshot.pdf`);

writeFileSync(templatePath, templateBytes);
if (shellBytes) writeFileSync(shellPath, shellBytes);

const { pdfBytes, filledCount } = await buildCojFilledPdf({
  templatePdfBytes: templateBytes,
  fieldMap: template.field_map ?? {},
  fieldValues,
});

writeFileSync(filledPath, pdfBytes);

const vaultPath = workingCopyCanonicalPath(clientId, formKind);
let vaultBytes = null;
try {
  const vaultRes = await fetch(`${baseUrl}/storage/v1/object/client-documents/${vaultPath}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (vaultRes.ok) {
    vaultBytes = new Uint8Array(await vaultRes.arrayBuffer());
    writeFileSync(join(OUT_DIR, 'vault-working-latest.pdf'), vaultBytes);
    console.log('\n--- Vault working copy (download only, not uploaded) ---');
    console.log('path ', vaultPath);
    console.log('bytes', vaultBytes.byteLength);
  } else {
    console.log('\n--- Vault working copy ---');
    console.log('not found', vaultRes.status, '(run autofill in app first, or this is first fill)');
  }
} catch (e) {
  console.log('\n--- Vault download failed ---', e.message);
}

console.log('\n--- Fill result (local pipeline, no upload) ---');
console.log('filledCount', filledCount);
console.log('output     ', filledPath);

console.log('\n--- Probes ---');
await probePdf('template snapshot', templateBytes);
if (shellBytes) await probePdf('shell snapshot', shellBytes);
await probePdf('filled output', pdfBytes);
if (vaultBytes) await probePdf('vault snapshot', vaultBytes);

const painted = extractPaintedStrings(pdfBytes);
console.log('\n--- Painted text in local output (decompressed streams) ---');
if (painted.length === 0) {
  console.log('  WARNING: no Tj strings found - PDF may render blank');
} else {
  for (const s of painted) console.log(' ', JSON.stringify(s));
}

const checks = [
  fieldValues.proposed_company_name,
  fieldValues.applicant_name,
  fieldValues.applicant_address,
  '24', '06', '26',
].filter(Boolean);
console.log('\n--- Field value presence in painted layer ---');
for (const s of checks) {
  const hit = painted.some((p) => p.includes(s) || s.includes(p));
  console.log(`  ${JSON.stringify(s)}:`, hit ? 'OK' : 'MISSING');
}

if (vaultBytes) {
  const vaultPainted = extractPaintedStrings(vaultBytes);
  console.log('\n--- Vault vs local ---');
  console.log('vault painted strings:', vaultPainted.length ? vaultPainted.map((s) => JSON.stringify(s)).join(', ') : 'none');
  const localOk = checks.every((s) => painted.some((p) => p.includes(s) || s.includes(p)));
  const vaultOk = checks.every((s) => vaultPainted.some((p) => p.includes(s) || s.includes(p)));
  console.log('local fill complete:', localOk ? 'YES' : 'NO');
  console.log('vault fill complete:', vaultOk ? 'YES' : 'NO');
  if (localOk && !vaultOk) {
    console.log('→ Local pipeline OK but vault stale - re-autofill in app or run with --upload when ready');
  }
}

console.log('\n--- Viewer note ---');
console.log('Output copies filled field appearances into an unencrypted PDF (+ drawText backup).');
console.log('Open the local file in Chrome/Acrobat here before uploading. On phone: download → Files/Adobe.');

console.log('\n=== Done - review local PDF before any upload ===\n');
console.log('Review:', filledPath);
if (vaultBytes) console.log('Vault snapshot:', join(OUT_DIR, 'vault-working-latest.pdf'));

if (openAfter) {
  try {
    execSync(`start "" "${filledPath}"`, { shell: true, stdio: 'ignore' });
  } catch {
    console.log('Could not auto-open; open manually:', filledPath);
  }
}