/**
 * Ticket #06 Phase A static verify.
 * Run: node onboardin/scripts/verify-google-drive.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let passed = 0;
let failed = 0;
function ok(label) { passed++; console.log(`  ✓ ${label}`); }
function bad(label, detail = '') { failed++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
function assert(cond, label, detail = '') { if (cond) ok(label); else bad(label, detail); }

console.log('\n=== Google Drive export (#06 Phase A) ===\n');

const mapPath = join(root, 'src/data/drive-vault-category-map.json');
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
assert(map.root.includes('Onboardin'), 'folder map: root');
assert(map.subfolders.Registration?.includes('articles'), 'folder map: Registration/articles');

const mig = readFileSync(join(root, 'supabase/migrations/20260619_document_integrations.sql'), 'utf8');
assert(mig.includes('client_integrations'), 'migration: client_integrations');
assert(mig.includes('storage_mode'), 'migration: storage_mode');

const edge = readFileSync(join(root, 'supabase/functions/integrations-google-drive/index.ts'), 'utf8');
for (const action of ['oauth_start', 'oauth_callback', 'ensure_folder_tree', 'upload_file', 'disconnect']) {
  assert(edge.includes(action), `edge handler listed: ${action}`);
}
assert(edge.includes('auth_url'), 'edge: oauth URL builder');

const integrationJs = readFileSync(join(root, 'src/lib/google-drive-integration.js'), 'utf8');
assert(integrationJs.includes('integrations-google-drive'), 'client: edge call');

const panel = readFileSync(join(root, 'src/components/GoogleDriveConnectPanel.jsx'), 'utf8');
assert(panel.includes('Connect Google Drive'), 'UI: connect CTA');

const lazy = readFileSync(join(root, 'src/lib/lazy-document-ui.jsx'), 'utf8');
assert(lazy.includes('LazyGoogleDriveConnectPanel'), 'lazy: Drive panel split');

const dash = readFileSync(join(root, 'src/components/Dashboard.jsx'), 'utf8');
assert(dash.includes('LazyGoogleDriveConnectPanel'), 'dashboard: Drive panel wired');

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
