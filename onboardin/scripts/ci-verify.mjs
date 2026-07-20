/**
 * CI static verify: compliance step-06 checks + golden envelope/fill/sign fixtures.
 * Run from repo root: node onboardin/scripts/ci-verify.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  resolveComplianceSlug,
  evaluateAcceptCriteria,
  isIntakeComplete,
} from '../src/lib/compliance.js';
import {
  validateInviteToken,
  assertSignerEmailMatch,
} from '../src/lib/envelope-invite.js';
import { loadFixture } from './load-fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoOnboardin = join(here, '..');

let passed = 0;
let failed = 0;
function ok(label) { passed++; console.log(`  ✓ ${label}`); }
function bad(label, detail = '') { failed++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
function assert(cond, label, detail = '') { if (cond) ok(label); else bad(label, detail); }

function extractBlueprint(sql, slug) {
  const marker = `'${slug}'`;
  const start = sql.indexOf(marker);
  if (start < 0) throw new Error(`slug ${slug} not in migration`);
  const slice = sql.slice(start);
  const match = slice.match(/'(\{"id":[^']+\})'::jsonb/);
  if (!match) throw new Error(`blueprint JSON not found for ${slug}`);
  return JSON.parse(match[1]);
}

console.log('\n=== CI verify (step-06 + golden fixtures) ===\n');

const migrationPath = join(repoOnboardin, 'supabase/migrations/20260619_compliance_procedure_guides.sql');
const sql = readFileSync(migrationPath, 'utf8');
assert(sql.includes('procedure_guides'), 'migration: procedure_guides present');

const jamaicaSlug = resolveComplianceSlug('Jamaica', 'Ltd', 'Jamaica');
assert(jamaicaSlug === 'jamaica-ltd-privacy', 'compliance: Jamaica Ltd slug', jamaicaSlug);

const blueprint = extractBlueprint(sql, jamaicaSlug);
const intakeFixture = {
  sells_to: 'B2B',
  has_website: false,
  has_employees: false,
  processes_jamaica_residents: true,
};
const artifactFixture = [
  { kind: 'privacy_policy', status: 'active', hosted_url: 'https://example.com/privacy' },
  { kind: 'jamaica_oic_registration', status: 'active', artifact_path: 'oic-proof.pdf' },
  { kind: 'retention_schedule', status: 'active', artifact_path: 'retention.pdf' },
  { kind: 'breach_response_plan', status: 'active', artifact_path: 'breach.pdf' },
];

assert(isIntakeComplete(blueprint, intakeFixture), 'compliance: intake complete fixture');
assert(
  evaluateAcceptCriteria(blueprint, intakeFixture, artifactFixture, []).pass,
  'compliance: accept criteria pass',
);

const envelopeCases = loadFixture('envelope-invite-cases');
for (const [name, row] of Object.entries(envelopeCases)) {
  if (row.expect !== 'ok' && row.expect !== 'error') continue;
  const result = validateInviteToken(row.invite, row.signer, row.envelope);
  if (row.expect === 'ok') assert(result.ok === true, `fixture envelope ${name}: ok`);
  else assert(!!result.error, `fixture envelope ${name}: rejects`);
}

const signCases = loadFixture('sign-portal-cases');
for (const [name, row] of Object.entries(signCases)) {
  if (!row.session_email) continue;
  const result = assertSignerEmailMatch(row.session_email, row.signer_email);
  if (row.expect === 'ok') assert(result.ok === true, `fixture sign ${name}: email match`);
  else assert(!!result.error, `fixture sign ${name}: email mismatch`);
}

const fillCases = loadFixture('fill-job-cases');
assert(fillCases.terminal_signed.expect_client_update_blocked === true, 'fixture fill: signed is terminal');
assert(fillCases.editable_working_saved.expect_client_update_blocked === false, 'fixture fill: working_saved editable');
assert(fillCases.illegal_revert_to_filled.expect_trigger_blocks === true, 'fixture fill: signed to filled blocked');

const editorSrc = readFileSync(join(repoOnboardin, 'src/components/DocumentEditor.jsx'), 'utf8');
assert(editorSrc.includes(".not('status', 'in'"), 'editor: blocks update on terminal job statuses');

const migSecurity = readFileSync(
  join(repoOnboardin, 'supabase/migrations/20260720_security_hardening_envelope_jobs_storage.sql'),
  'utf8',
);
assert(migSecurity.includes('guard_document_job_mutation'), 'migration: job state guard trigger');

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
