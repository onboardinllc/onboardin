import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument } from '../src/vendor/pdf-lib.esm.min.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const creds = readFileSync(join(__dirname, '../../scaffolds/credentials.md'), 'utf8');
const serviceKey = creds.match(/\*\*Service role key[^*]*\*\*\s*(.+)/)?.[1]?.trim();
const baseUrl = creds.match(/\*\*Project URL:\*\*\s*(.+)/)?.[1]?.trim();
const clientId = '12516ae7-64af-49df-8ac2-eea7367077b3';

const paths = {
  template: 'public-forms/coj/form-6.pdf',
  workingLatest: `${clientId}/articles/coj_form_6/working-latest.pdf`,
};

async function fetchBytes(bucket, path, publicBucket = false) {
  const url = publicBucket
    ? `${baseUrl}/storage/v1/object/public/${bucket}/${path}`
    : `${baseUrl}/storage/v1/object/${bucket}/${path}`;
  const res = await fetch(url, {
    headers: publicBucket ? {} : { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  return { status: res.status, bytes: new Uint8Array(await res.arrayBuffer()) };
}

async function probeLabel(label, bytes) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const fields = doc.getForm().getFields();
  const samples = [7, 9, 15, 0, 1, 2].map((i) => {
    try { return `[${i}]=${JSON.stringify(fields[i]?.getText?.() ?? '')}`; } catch { return `[${i}]=?`; }
  });
  console.log(`  ${label}: ${bytes.byteLength} bytes, ${doc.getPageCount()} pages, ${fields.length} fields`);
  console.log('   ', samples.join(' '));
}

console.log('=== Storage object comparison ===\n');

const templateRes = await fetchBytes('public-forms', 'coj/form-6.pdf', true);
const workingRes = await fetchBytes('client-documents', paths.workingLatest);

console.log('Template (public):', templateRes.status, templateRes.bytes.byteLength);
await probeLabel('template', templateRes.bytes);
console.log('Working copy (working-latest.pdf):', workingRes.status, workingRes.bytes.byteLength);
if (workingRes.status === 200) await probeLabel('workingLatest', workingRes.bytes);

const sameAsTemplate = workingRes.status === 200 && workingRes.bytes.byteLength === templateRes.bytes.byteLength;
console.log('\nSame byte length as template?', sameAsTemplate);

const docs = await fetch(`${baseUrl}/rest/v1/documents?client_id=eq.${clientId}&category=eq.coj_form_6&select=id,name,path,size,created_at&order=created_at.desc`, {
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
}).then((r) => r.json());

console.log('\n=== documents rows (coj_form_6) ===');
for (const d of Array.isArray(docs) ? docs : []) console.log(`  ${d.created_at} | ${d.size} | ${d.path}`);

const templates = await fetch(`${baseUrl}/rest/v1/legal_templates?kind=eq.coj_form_6&provider=eq.coj&select=id,template_path,field_map`, {
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
}).then((r) => r.json());

const jobs = await fetch(`${baseUrl}/rest/v1/document_jobs?client_id=eq.${clientId}&select=id,template_id,status,filled_path,filled_by,field_values,updated_at`, {
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
}).then((r) => r.json());

const cojJob = (jobs || []).find((j) => templates?.[0] && j.template_id === templates[0].id);
console.log('\n=== document_jobs (COJ form 6) ===');
console.log(JSON.stringify(cojJob, null, 2));
console.log('\n=== legal_templates.template_path ===');
console.log(templates?.[0]?.template_path);