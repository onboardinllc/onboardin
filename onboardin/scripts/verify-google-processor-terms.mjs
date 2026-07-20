/**
 * Compliance #10: Google Cloud / Drive processor terms — static alignment checks.
 * Run: node onboardin/scripts/verify-google-processor-terms.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  GOOGLE_DRIVE_SCOPE,
  GOOGLE_DRIVE_CONNECT_DISCLOSURE,
  GOOGLE_LIMITED_USE_SUMMARY,
  GOOGLE_PROCESSOR_OPS_CHECKLIST,
} from '../src/lib/google-drive-processor.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const workspace = join(root, '..');

let passed = 0;
let failed = 0;
function ok(label) { passed++; console.log(`  ✓ ${label}`); }
function bad(label, detail = '') { failed++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
function assert(cond, label, detail = '') { if (cond) ok(label); else bad(label, detail); }

console.log('\n=== Google processor terms (compliance #10) ===\n');

assert(GOOGLE_DRIVE_SCOPE.includes('drive.file'), 'scope: drive.file only');
assert(GOOGLE_DRIVE_CONNECT_DISCLOSURE.includes('Onboardin folder'), 'disclosure: folder tree');
assert(GOOGLE_LIMITED_USE_SUMMARY.toLowerCase().includes('limited'), 'limited use summary present');
assert(GOOGLE_PROCESSOR_OPS_CHECKLIST.length >= 5, 'ops checklist for Jayson');

const privacyPath = join(workspace, 'documents/Onboardin - Privacy Policy.md');
const privacy = readFileSync(privacyPath, 'utf8');
assert(privacy.includes('Google LLC'), 'privacy draft: Google LLC processor row');
assert(privacy.includes('drive.file'), 'privacy draft: drive.file scope');
assert(privacy.toLowerCase().includes('limited use') || privacy.includes('before Drive integration ships'), 'privacy draft: limited use or ship gate');

const howWeUse = readFileSync(join(workspace, 'documents/Onboardin - How We Use Your Data and Files.md'), 'utf8');
assert(howWeUse.includes('Google API Services User Data Policy'), 'how-we-use: Google API policy named');

const edgeSrc = readFileSync(join(root, 'supabase/functions/integrations-google-drive/index.ts'), 'utf8');
assert(edgeSrc.includes('drive.file'), 'edge: drive.file scope');
assert(edgeSrc.includes('auth_url'), 'edge: oauth_start can return auth_url');

const panelSrc = readFileSync(join(root, 'src/components/GoogleDriveConnectPanel.jsx'), 'utf8');
assert(panelSrc.includes('GOOGLE_DRIVE_CONNECT_DISCLOSURE'), 'UI: connect disclosure wired');

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
