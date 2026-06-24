# Credits

Third-party sources used in Onboardin. Update when deps change.

## PDF

- **PyMuPDF** (Artifex): COJ autofill local scripts. AGPL-3.0. https://pymupdf.readthedocs.io/
- **MuPDF.js** (`mupdf`): COJ autofill edge. AGPL-3.0. https://www.npmjs.com/package/mupdf
- **pdf-lib**: signature burn, non-COJ overlay. MIT. https://github.com/Hopding/pdf-lib
- **pypdf**: dev field probing only. BSD-3-Clause. https://github.com/py-pdf/pypdf

COJ fill uses MuPDF field names, not pdf-lib copy/drawText.

## App

- Preact, @supabase/supabase-js, Vite, Tailwind: see package.json (MIT)

## Form PDFs (not ours)

- COJ Jamaica: Form 6, BRF1, Form 1A, BOR. https://www.orcjamaica.com/
- IRS Form SS-4. https://www.irs.gov/

## Other

- Anthropic API: optional non-COJ LLM fill in document-fill edge
- Playwright, Node: dev scripts only

## Retired

- pdf-lib COJ autofill (2026-06): blank in viewers, replaced by MuPDF