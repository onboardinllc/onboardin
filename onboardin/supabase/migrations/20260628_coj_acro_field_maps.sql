-- COJ AcroForm field maps (replaces coordinate-burn estimates in 20260627).
-- acroField = PDF field name; acroIndex = 0-based index when names are encrypted (Form 6).

-- Form 6 — Name Reservation (encrypted field names; use indices from PDF QA)
UPDATE public.legal_templates SET
  field_map = '{
    "proposed_company_name": {"acroIndex": 15, "type": "text"},
    "applicant_name":        {"acroIndex": 7,  "type": "text"},
    "applicant_address":     {"acroIndex": 9,  "type": "text"},
    "reservation_date":      {"acroIndices": [0, 1, 2], "type": "date"}
  }'::jsonb,
  form_version = '2026-06-acro'
WHERE kind = 'coj_form_6' AND provider = 'coj';

-- Form 1A — Articles (readable AcroForm names)
UPDATE public.legal_templates SET
  field_map = '{
    "proposed_company_name":     {"acroField": "COMPANY NAME", "type": "text"},
    "registered_office_address": {"acroField": "COMPANY REGISTERED OFFICEADDRESSOTHER ADDRESS", "type": "text"},
    "authorized_share_capital":  {"acroField": "1 ORDINARY2 PREFERENCEOTHER3 Specify", "type": "text"},
    "director_1_name":           {"acroField": "OFFICER 1", "type": "text"},
    "director_2_name":           {"acroField": "OFFICER 2", "type": "text"}
  }'::jsonb,
  form_version = '2026-06-acro'
WHERE kind = 'coj_form_1a' AND provider = 'coj';

-- BOR Form A — Beneficial Ownership Return
UPDATE public.legal_templates SET
  field_map = '{
    "proposed_company_name": {"acroField": "Text Field16", "type": "text"},
    "shareholder_1_name":    {"acroField": "Text Field67", "type": "text"},
    "shareholder_1_address": {"acroField": "Text Field68", "type": "text"},
    "shareholder_1_trn":     {"acroField": "Text Field69", "type": "text"},
    "shareholder_1_shares":  {"acroField": "Text Field70", "type": "text"}
  }'::jsonb,
  form_version = '2026-06-acro'
WHERE kind = 'coj_bor' AND provider = 'coj';

-- BRF1 — not fillable via pdf-lib AcroForm (flat/corrupt XFA); disable autofill until re-hosted
UPDATE public.legal_templates SET
  field_map = '{}'::jsonb,
  form_version = '2026-06-acro'
WHERE kind = 'coj_brf1' AND provider = 'coj';