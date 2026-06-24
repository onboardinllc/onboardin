-- COJ Deterministic Autofill - Phase B (#10)
-- Populates placeholder_map + field_map for all 4 COJ forms.
-- IMPORTANT: field_map coordinates are ESTIMATES (coords_estimated).
-- Manual PDF QA required before claiming production-ready placement.
-- form_version pinned to 2026-06 for all forms.

-- Form 6 - Name Reservation
-- Single page; name + applicant block, top half of page.
UPDATE public.legal_templates SET
  placeholder_map = '{
    "proposed_company_name": {"source": "formation_draft.proposed_company_name"},
    "applicant_name":        {"source": "clients.founder_name"},
    "applicant_address":     {"source": "formation_draft.registered_office_address"},
    "reservation_date":      {"source": "computed.today"}
  }'::jsonb,
  field_map = '{
    "proposed_company_name": {"acroIndex": 15, "type": "text"},
    "applicant_name":        {"acroIndex": 7,  "type": "text"},
    "applicant_address":     {"acroIndex": 9,  "type": "text"},
    "reservation_date":      {"acroIndices": [0, 1, 2], "type": "date"}
  }'::jsonb,
  form_version = '2026-06'
WHERE kind = 'coj_form_6' AND provider = 'coj';

-- Form 1A - Articles of Incorporation
-- Multi-section; name/address header block + directors table.
UPDATE public.legal_templates SET
  placeholder_map = '{
    "proposed_company_name":    {"source": "formation_draft.proposed_company_name"},
    "registered_office_address":{"source": "formation_draft.registered_office_address"},
    "authorized_share_capital": {"source": "formation_draft.authorized_share_capital"},
    "director_1_name":          {"source": "formation_draft.directors.0.name"},
    "director_1_address":       {"source": "formation_draft.directors.0.address"},
    "director_1_trn":           {"source": "formation_draft.directors.0.trn"},
    "director_2_name":          {"source": "formation_draft.directors.1.name"},
    "director_2_address":       {"source": "formation_draft.directors.1.address"},
    "director_2_trn":           {"source": "formation_draft.directors.1.trn"}
  }'::jsonb,
  field_map = '{
    "proposed_company_name":     {"acroField": "COMPANY NAME", "type": "text"},
    "registered_office_address": {"acroField": "COMPANY REGISTERED OFFICEADDRESSOTHER ADDRESS", "type": "text"},
    "authorized_share_capital":  {"acroField": "1 ORDINARY2 PREFERENCEOTHER3 Specify", "type": "text"},
    "director_1_name":           {"acroField": "OFFICER 1", "type": "text"},
    "director_2_name":           {"acroField": "OFFICER 2", "type": "text"}
  }'::jsonb,
  form_version = '2026-06'
WHERE kind = 'coj_form_1a' AND provider = 'coj';

-- BOR Form A - Beneficial Ownership Return (partial map)
-- Individual shareholders only; corporate shareholders out of scope v1.
UPDATE public.legal_templates SET
  placeholder_map = '{
    "proposed_company_name":   {"source": "formation_draft.proposed_company_name"},
    "shareholder_1_name":      {"source": "formation_draft.shareholders.0.name"},
    "shareholder_1_address":   {"source": "formation_draft.shareholders.0.address"},
    "shareholder_1_trn":       {"source": "formation_draft.shareholders.0.trn"},
    "shareholder_1_shares":    {"source": "formation_draft.shareholders.0.shares"},
    "bor_notes":               {"source": "formation_draft.bor_notes"}
  }'::jsonb,
  field_map = '{
    "proposed_company_name": {"acroField": "Text Field16", "type": "text"},
    "shareholder_1_name":    {"acroField": "Text Field67", "type": "text"},
    "shareholder_1_address": {"acroField": "Text Field68", "type": "text"},
    "shareholder_1_trn":     {"acroField": "Text Field69", "type": "text"},
    "shareholder_1_shares":  {"acroField": "Text Field70", "type": "text"}
  }'::jsonb,
  form_version = '2026-06'
WHERE kind = 'coj_bor' AND provider = 'coj';

-- BRF1 Super Form (partial map - header block only; full BRF1 is Phase B+ manual QA sprint)
UPDATE public.legal_templates SET
  placeholder_map = '{
    "proposed_company_name":    {"source": "formation_draft.proposed_company_name"},
    "registered_office_address":{"source": "formation_draft.registered_office_address"},
    "authorized_share_capital": {"source": "formation_draft.authorized_share_capital"},
    "director_1_name":          {"source": "formation_draft.directors.0.name"},
    "director_1_trn":           {"source": "formation_draft.directors.0.trn"},
    "founder_name":             {"source": "clients.founder_name"}
  }'::jsonb,
  field_map = '{}'::jsonb,
  form_version = '2026-06'
WHERE kind = 'coj_brf1' AND provider = 'coj';
