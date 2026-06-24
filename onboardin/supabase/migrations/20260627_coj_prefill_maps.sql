-- COJ Deterministic Autofill — Phase B (#10)
-- Populates placeholder_map + field_map for all 4 COJ forms.
-- IMPORTANT: field_map coordinates are ESTIMATES (coords_estimated).
-- Manual PDF QA required before claiming production-ready placement.
-- form_version pinned to 2026-06 for all forms.

-- Form 6 — Name Reservation
-- Single page; name + applicant block, top half of page.
UPDATE public.legal_templates SET
  placeholder_map = '{
    "proposed_company_name": {"source": "formation_draft.proposed_company_name"},
    "applicant_name":        {"source": "clients.founder_name"},
    "applicant_address":     {"source": "formation_draft.registered_office_address"},
    "reservation_date":      {"source": "computed.today"}
  }'::jsonb,
  field_map = '{
    "proposed_company_name": {"page": 0, "x": 120, "y": 200, "w": 320, "h": 18, "type": "text",  "fontSize": 9},
    "applicant_name":        {"page": 0, "x": 120, "y": 270, "w": 260, "h": 18, "type": "text",  "fontSize": 9},
    "applicant_address":     {"page": 0, "x": 120, "y": 295, "w": 320, "h": 18, "type": "text",  "fontSize": 9},
    "reservation_date":      {"page": 0, "x": 120, "y": 320, "w": 160, "h": 18, "type": "date",  "fontSize": 9}
  }'::jsonb,
  form_version = '2026-06'
WHERE kind = 'coj_form_6' AND provider = 'coj';

-- Form 1A — Articles of Incorporation
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
    "proposed_company_name":    {"page": 0, "x": 120, "y": 185, "w": 330, "h": 18, "type": "text", "fontSize": 9},
    "registered_office_address":{"page": 0, "x": 120, "y": 215, "w": 330, "h": 18, "type": "text", "fontSize": 9},
    "authorized_share_capital": {"page": 0, "x": 120, "y": 245, "w": 280, "h": 18, "type": "text", "fontSize": 9},
    "director_1_name":          {"page": 0, "x": 72,  "y": 380, "w": 200, "h": 16, "type": "text", "fontSize": 8},
    "director_1_address":       {"page": 0, "x": 280, "y": 380, "w": 180, "h": 16, "type": "text", "fontSize": 8},
    "director_1_trn":           {"page": 0, "x": 468, "y": 380, "w": 80,  "h": 16, "type": "text", "fontSize": 8},
    "director_2_name":          {"page": 0, "x": 72,  "y": 400, "w": 200, "h": 16, "type": "text", "fontSize": 8},
    "director_2_address":       {"page": 0, "x": 280, "y": 400, "w": 180, "h": 16, "type": "text", "fontSize": 8},
    "director_2_trn":           {"page": 0, "x": 468, "y": 400, "w": 80,  "h": 16, "type": "text", "fontSize": 8}
  }'::jsonb,
  form_version = '2026-06'
WHERE kind = 'coj_form_1a' AND provider = 'coj';

-- BOR Form A — Beneficial Ownership Return (partial map)
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
    "proposed_company_name":   {"page": 0, "x": 120, "y": 200, "w": 300, "h": 18, "type": "text", "fontSize": 9},
    "shareholder_1_name":      {"page": 0, "x": 72,  "y": 320, "w": 200, "h": 16, "type": "text", "fontSize": 8}
  }'::jsonb,
  form_version = '2026-06'
WHERE kind = 'coj_bor' AND provider = 'coj';

-- BRF1 Super Form (partial map — header block only; full BRF1 is Phase B+ manual QA sprint)
UPDATE public.legal_templates SET
  placeholder_map = '{
    "proposed_company_name":    {"source": "formation_draft.proposed_company_name"},
    "registered_office_address":{"source": "formation_draft.registered_office_address"},
    "authorized_share_capital": {"source": "formation_draft.authorized_share_capital"},
    "director_1_name":          {"source": "formation_draft.directors.0.name"},
    "director_1_trn":           {"source": "formation_draft.directors.0.trn"},
    "founder_name":             {"source": "clients.founder_name"}
  }'::jsonb,
  field_map = '{
    "proposed_company_name":    {"page": 0, "x": 120, "y": 200, "w": 300, "h": 18, "type": "text", "fontSize": 9},
    "director_1_name":          {"page": 0, "x": 120, "y": 280, "w": 240, "h": 16, "type": "text", "fontSize": 8}
  }'::jsonb,
  form_version = '2026-06'
WHERE kind = 'coj_brf1' AND provider = 'coj';
