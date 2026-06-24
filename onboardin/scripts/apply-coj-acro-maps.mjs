/**
 * One-shot: push AcroForm field_map updates to live legal_templates.
 * Run: node scripts/apply-coj-acro-maps.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const credPath = join(__dirname, '../../scaffolds/credentials.md');
const creds = readFileSync(credPath, 'utf8');
const serviceKey = creds.match(/Service role key[^:]*:\*\*\s*([^\s]+)/)?.[1];
const baseUrl = creds.match(/Project URL:\*\*\s*([^\s]+)/)?.[1];
if (!serviceKey || !baseUrl) throw new Error('Missing Supabase credentials in scaffolds/credentials.md');

const UPDATES = [
  {
    kind: 'coj_form_6',
    field_map: {
      proposed_company_name: { acroIndex: 15, type: 'text' },
      applicant_name: { acroIndex: 7, type: 'text' },
      applicant_address: { acroIndex: 9, type: 'text' },
      reservation_date: { acroIndices: [0, 1, 2], type: 'date' },
    },
  },
  {
    kind: 'coj_form_1a',
    field_map: {
      proposed_company_name: { acroField: 'COMPANY NAME', type: 'text' },
      registered_office_address: { acroField: 'COMPANY REGISTERED OFFICEADDRESSOTHER ADDRESS', type: 'text' },
      authorized_share_capital: { acroField: '1 ORDINARY2 PREFERENCEOTHER3 Specify', type: 'text' },
      director_1_name: { acroField: 'OFFICER 1', type: 'text' },
      director_2_name: { acroField: 'OFFICER 2', type: 'text' },
    },
  },
  {
    kind: 'coj_bor',
    field_map: {
      proposed_company_name: { acroField: 'Text Field16', type: 'text' },
      shareholder_1_name: { acroField: 'Text Field67', type: 'text' },
      shareholder_1_address: { acroField: 'Text Field68', type: 'text' },
      shareholder_1_trn: { acroField: 'Text Field69', type: 'text' },
      shareholder_1_shares: { acroField: 'Text Field70', type: 'text' },
    },
  },
  {
    kind: 'coj_brf1',
    field_map: {},
  },
];

for (const row of UPDATES) {
  const res = await fetch(`${baseUrl}/rest/v1/legal_templates?kind=eq.${row.kind}&provider=eq.coj`, {
    method: 'PATCH',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ field_map: row.field_map, form_version: '2026-06-acro' }),
  });
  const json = await res.json();
  if (!res.ok) {
    console.error('FAIL', row.kind, json);
    process.exit(1);
  }
  const acroKeys = Object.values(row.field_map).filter((d) => d.acroField || typeof d.acroIndex === 'number').length;
  console.log(`OK ${row.kind} - ${acroKeys} acro targets`);
}