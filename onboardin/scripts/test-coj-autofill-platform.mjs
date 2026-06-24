/**
 * Platform COJ autofill test — same path as the Onboardin PWA (edge MuPDF fill).
 * Signs in as test client, calls document-fill fill_coj_pdf, verifies visible text.
 *
 * Usage:
 *   node scripts/test-coj-autofill-platform.mjs
 *   node scripts/test-coj-autofill-platform.mjs --upload
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { resolveEntityFacts, resolveCojFieldValues } from '../src/lib/company-context.js';
import { fillAcroPdfViaEdge } from '../src/lib/pdf-autofill-edge.js';
import { runDocumentAutofill } from '../src/lib/autofill-service.js';
import { workingCopyCanonicalPath } from '../src/lib/coj-formation-packet.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'local-output');

const creds = readFileSync(join(__dirname, '../../scaffolds/credentials.md'), 'utf8');
const anonKey = creds.match(/\*\*Anon key \(public\):\*\*\s*(.+)/)?.[1]?.trim();
const baseUrl = creds.match(/\*\*Project URL:\*\*\s*(.+)/)?.[1]?.trim();
const clientBlock = creds.match(/## Test Client Account[\s\S]*?(?=\n## |\n---\n|$)/)?.[0] || '';
const testEmail = clientBlock.match(/\*\*Email:\*\*\s*(.+)/)?.[1]?.trim();
const testPassword = clientBlock.match(/\*\*Password:\*\*\s*(.+)/)?.[1]?.trim()
  || creds.match(/^admin:\s*(.+)$/m)?.[1]?.trim();
if (!testEmail || !testPassword) throw new Error('Test client credentials not found in credentials.md');

const args = process.argv.slice(2);
const doUpload = args.includes('--upload');
const clientIdx = args.indexOf('--client');
const clientId = clientIdx >= 0 ? args[clientIdx + 1] : '12516ae7-64af-49df-8ac2-eea7367077b3';

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
  return { ok: py.stdout?.includes('VISIBLE_OK'), output: py.stdout || py.stderr };
}

mkdirSync(OUT_DIR, { recursive: true });

console.log('\n=== Platform COJ autofill (edge MuPDF, test client session) ===\n');

const serviceKey = creds.match(/\*\*Service role key[^*]*\*\*\s*(.+)/)?.[1]?.trim();
const supabase = createClient(baseUrl, anonKey);

async function signInTestClient() {
  const pwRes = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  if (pwRes.ok) {
    const json = await pwRes.json();
    const { data, error } = await supabase.auth.setSession({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
    });
    if (error || !data?.session) throw new Error(`setSession failed: ${error?.message}`);
    return data.session;
  }

  const linkRes = await fetch(`${baseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email: testEmail }),
  });
  const linkJson = await linkRes.json();
  if (!linkRes.ok) throw new Error(linkJson.msg || linkJson.error_description || 'magic link failed');

  const verifyRes = await fetch(linkJson.action_link, { redirect: 'manual' });
  const loc = verifyRes.headers.get('location') || '';
  const hash = loc.includes('#') ? loc.split('#')[1] : '';
  const params = new URLSearchParams(hash);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token) throw new Error('magic link verify returned no access_token');

  const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error || !data?.session) throw new Error(`setSession failed: ${error?.message}`);
  console.log('Signed in via magic link as', testEmail);
  return data.session;
}

const session = await signInTestClient();
console.log('Signed in as', testEmail);

const { data: clientProfile, error: cpErr } = await supabase
  .from('clients')
  .select('*')
  .eq('id', clientId)
  .single();
if (cpErr || !clientProfile) throw new Error(`Client load failed: ${cpErr?.message}`);

const { data: templates, error: tErr } = await supabase
  .from('legal_templates')
  .select('*')
  .eq('kind', 'coj_form_6')
  .eq('provider', 'coj')
  .eq('active', true)
  .limit(1);
if (tErr || !templates?.[0]) throw new Error(`Template load failed: ${tErr?.message}`);
const template = templates[0];

const formationDraft = typeof clientProfile.formation_draft === 'string'
  ? JSON.parse(clientProfile.formation_draft || '{}')
  : (clientProfile.formation_draft ?? {});

const fieldValues = resolveCojFieldValues(template, resolveEntityFacts({
  client: clientProfile,
  entityProfile: clientProfile.entity_profile ?? {},
  formationDraft,
  complianceIntake: {},
}));
console.log('field_values', JSON.stringify(fieldValues, null, 2));

console.log('\n--- Edge fill (fill_coj_pdf) ---');
const { pdfBytes, filledCount } = await fillAcroPdfViaEdge({
  supabase,
  template,
  formId: 'coj_form_6',
  fieldValues,
});
const edgeOut = join(OUT_DIR, 'form-6-platform-edge.pdf');
writeFileSync(edgeOut, pdfBytes);
console.log('filled_count', filledCount, 'bytes', pdfBytes.byteLength, '→', edgeOut);

const vis = verifyVisibleText(edgeOut, fieldValues);
console.log(vis.output);
if (!vis.ok) {
  console.error('\nFAIL: edge fill not visible in PDF text layer');
  process.exit(1);
}
console.log('\nPASS: edge fill visible');

if (doUpload) {
  const { data: jobs } = await supabase
    .from('document_jobs')
    .select('id')
    .eq('client_id', clientId)
    .eq('form_id', 'coj_form_6')
    .order('updated_at', { ascending: false })
    .limit(1);
  const jobId = jobs?.[0]?.id;
  if (!jobId) throw new Error('No document_jobs row for coj_form_6');

  // Patch build path: force edge by mocking browser window for autofill upload step.
  const savedWindow = globalThis.window;
  globalThis.window = globalThis;
  try {
    const result = await runDocumentAutofill({
      supabase,
      session,
      clientProfile,
      formationDraft,
      template,
      jobId,
      formId: 'coj_form_6',
    });
    console.log('\nVault upload OK:', result.storagePath);
    console.log('Canonical path:', workingCopyCanonicalPath(clientId, 'coj_form_6'));
  } finally {
    if (savedWindow === undefined) delete globalThis.window;
    else globalThis.window = savedWindow;
  }
}

console.log('\nDone.\n');