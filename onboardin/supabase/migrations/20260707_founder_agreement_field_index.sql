-- Founder agreement field index (pilot for in-app document editor).
-- Verified against public-forms/templates/founder-agreement-v1.pdf:
-- 1 page, 612 x 792 pt (Letter), no AcroForm - coordinate strategy.
-- Coordinates are top-left UI origin in PDF points; burn-in flips to
-- bottom-left (pdfY = pageHeight - y - h) in document-sign-pdf.js.
-- Layout: reading order below the title block (title baseline at UI y ~58).

update public.legal_templates
set field_map = '{
  "company_name":      {"page": 0, "x": 72, "y": 160, "w": 320, "h": 24, "type": "text"},
  "founder_name":      {"page": 0, "x": 72, "y": 196, "w": 320, "h": 24, "type": "text"},
  "governing_law":     {"page": 0, "x": 72, "y": 232, "w": 320, "h": 24, "type": "text"},
  "effective_date":    {"page": 0, "x": 72, "y": 268, "w": 160, "h": 24, "type": "date"},
  "founder_signature": {"page": 0, "x": 72, "y": 320, "w": 220, "h": 56, "type": "signature"}
}'::jsonb
where kind = 'founder_agreement' and vault_card_id = 'founder_docs';

-- Catalog rows mirror field_map so the admin registry sees the same index.
-- registry_key stays null: placeholder_map sources for this template come
-- from the 20260624 seed (clients.*), not entity_profile paths, so an
-- admin publish must not overwrite them until keys are mapped deliberately.
insert into public.template_field_catalog
  (template_id, field_key, pdf_label, page, field_type, pdf_target, registry_key, catalog_version)
select
  t.id,
  v.field_key,
  v.pdf_label,
  0,
  v.field_type,
  v.pdf_target::jsonb,
  null,
  '2026-07'
from public.legal_templates t
cross join (values
  ('company_name', 'Company name', 'text', '{"x": 72, "y": 160, "w": 320, "h": 24}'),
  ('founder_name', 'Founder name', 'text', '{"x": 72, "y": 196, "w": 320, "h": 24}'),
  ('governing_law', 'Governing law', 'text', '{"x": 72, "y": 232, "w": 320, "h": 24}'),
  ('effective_date', 'Effective date', 'date', '{"x": 72, "y": 268, "w": 160, "h": 24}'),
  ('founder_signature', 'Founder signature', 'signature', '{"x": 72, "y": 320, "w": 220, "h": 56}')
) as v(field_key, pdf_label, field_type, pdf_target)
where t.kind = 'founder_agreement' and t.vault_card_id = 'founder_docs'
on conflict (template_id, field_key) do update set
  pdf_label = excluded.pdf_label,
  page = excluded.page,
  field_type = excluded.field_type,
  pdf_target = excluded.pdf_target,
  catalog_version = excluded.catalog_version,
  updated_at = now();
