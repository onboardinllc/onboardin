import { readFileSync, writeFileSync } from 'fs';
import { PDFDocument } from '../src/vendor/pdf-lib.esm.min.js';
import { buildCojFilledPdf } from './pdf-fill-node.mjs';
import { spawnSync } from 'child_process';

const MAPS = {
  form6: {
    formKind: 'coj_form_6',
    url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-6.pdf',
    field_map: {
      proposed_company_name: { acroIndex: 15, type: 'text' },
      applicant_name: { acroIndex: 7, type: 'text' },
      applicant_address: { acroIndex: 9, type: 'text' },
      reservation_date: { acroIndices: [0, 1, 2], type: 'date' },
    },
    values: {
      proposed_company_name: 'ACME JAMAICA LTD',
      applicant_name: 'Jane Founder',
      applicant_address: '14 Camp Road, Kingston',
      reservation_date: '24/06/2026',
    },
    checks: [15, 18, 19, 21],
  },
  form1a: {
    formKind: 'coj_form_1a',
    url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-1a.pdf',
    field_map: {
      proposed_company_name: { acroField: 'COMPANY NAME', type: 'text' },
      registered_office_address: { acroField: 'COMPANY REGISTERED OFFICEADDRESSOTHER ADDRESS', type: 'text' },
    },
    values: {
      proposed_company_name: 'ACME JAMAICA LTD',
      registered_office_address: '14 Camp Road, Kingston',
    },
    checks: ['COMPANY NAME', 'COMPANY REGISTERED OFFICEADDRESSOTHER ADDRESS'],
  },
};

let pass = 0;
let fail = 0;

for (const [name, cfg] of Object.entries(MAPS)) {
  const res = await fetch(cfg.url);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const { pdfBytes: out } = await buildCojFilledPdf({
    templatePdfBytes: bytes,
    fieldMap: cfg.field_map,
    fieldValues: cfg.values,
    formKind: cfg.formKind,
  });

  const encrypted = Buffer.from(out).toString('latin1').includes('/Encrypt');
  const doc = await PDFDocument.load(out, { ignoreEncryption: true });
  const formFields = doc.getForm().getFields();
  let ok = true;
  if (name === 'form6') {
    if (encrypted) {
      console.log(`FAIL ${name} still encrypted`);
      ok = false;
    } else if (out.byteLength < 150000 || out.byteLength > 300000) {
      console.log(`FAIL ${name} unexpected size (${out.byteLength})`);
      ok = false;
    } else {
      writeFileSync('verify-tmp-form6.pdf', out);
      const py = spawnSync('python', ['-c', `
import fitz, sys
d=fitz.open(sys.argv[1])
text = ''
for p in range(d.page_count):
    for w in d[p].widgets():
        text += (w.field_value or '') + ' '
    text += d[p].get_text()
d.close()
for s in ['ACME JAMAICA LTD','Jane Founder','14 Camp Road']:
  if s not in text: raise SystemExit(1)
`, 'verify-tmp-form6.pdf'], { encoding: 'utf8' });
      if (py.status !== 0) {
        console.log(`FAIL ${name} filled values not present in PDF`);
        ok = false;
      }
    }
  } else if (out.byteLength < 700000) {
    console.log(`FAIL ${name} output too small (${out.byteLength} bytes)`);
    ok = false;
  } else {
    writeFileSync('verify-tmp-form1a.pdf', out);
    const py = spawnSync('python', ['-c', `
import fitz, sys
d=fitz.open(sys.argv[1])
text = ''
for w in d[0].widgets():
    text += (w.field_value or '') + ' '
for p in range(d.page_count):
    text += d[p].get_text()
d.close()
for s in ['ACME JAMAICA LTD','14 Camp Road']:
  if s not in text: raise SystemExit(1)
`, 'verify-tmp-form1a.pdf'], { encoding: 'utf8' });
    if (py.status !== 0) {
      console.log(`FAIL ${name} filled text not visible on page 1`);
      ok = false;
    }
  }
  if (ok) {
    console.log(`PASS ${name} (${out.byteLength} bytes, encrypted=${encrypted}, fields=${formFields.length})`);
    pass += 1;
  } else {
    fail += 1;
  }
}

if (fail) process.exit(1);
console.log(`\n${pass} passed, ${fail} failed`);