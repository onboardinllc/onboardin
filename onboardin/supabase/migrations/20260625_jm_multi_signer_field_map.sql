-- JM shareholders agreement: multi-signer field map as dedicated columns (not inside field_map).
-- Solo overlay continues to use field_map (founder_signature only).
-- Envelope flows use multi_signer_field_map + multi_signer_enabled.

-- Clean up mistaken nested keys if an earlier draft migration ran
update public.legal_templates
set field_map = field_map - 'multi_signer_field_map' - 'multi_signer_enabled'
where kind = 'jm_shareholders_agreement'
  and (field_map ? 'multi_signer_field_map' or field_map ? 'multi_signer_enabled');

alter table public.legal_templates
  add column if not exists multi_signer_field_map jsonb,
  add column if not exists multi_signer_enabled boolean not null default false;

-- x/y coordinates are initial estimates; verify against jm-shareholders-agreement.pdf before Slice 4.
update public.legal_templates
set
  multi_signer_field_map = jsonb_build_object(
    'founder_1_signature', jsonb_build_object(
      'page', 0, 'x', 72, 'y', 120, 'w', 200, 'h', 48, 'type', 'signature'
    ),
    'founder_2_signature', jsonb_build_object(
      'page', 0, 'x', 300, 'y', 120, 'w', 200, 'h', 48, 'type', 'signature'
    ),
    'effective_date', jsonb_build_object(
      'page', 0, 'x', 72, 'y', 680, 'w', 180, 'h', 20, 'type', 'date'
    )
  ),
  multi_signer_enabled = true
where kind = 'jm_shareholders_agreement'
  and active = true;