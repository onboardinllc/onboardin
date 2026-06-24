/**
 * Apply one migration SQL file to live Supabase via Management API.
 * Usage: node scripts/apply-live-migration.mjs <migration-file.sql>
 * Requires SUPABASE_ACCESS_TOKEN env var.
 */
import { readFileSync } from 'fs';
import { basename, resolve } from 'path';

const projectRef = 'qatfiicpkunabpphwqee';
const token = process.env.SUPABASE_ACCESS_TOKEN;
const fileArg = process.argv[2];

if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}
if (!fileArg) {
  console.error('Usage: node scripts/apply-live-migration.mjs <migration-file.sql>');
  process.exit(1);
}

const sqlPath = resolve(fileArg);
const sql = readFileSync(sqlPath, 'utf8');
const label = basename(sqlPath);

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`FAIL ${label} (${res.status})`);
  console.error(text);
  process.exit(1);
}

console.log(`OK ${label}`);
if (text && text !== '[]') console.log(text);