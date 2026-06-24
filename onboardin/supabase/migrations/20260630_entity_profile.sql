-- Entity profile - canonical company facts store (Ticket #10 / profile autofill plan)
-- Values are jsonb for schema flexibility; shape driven by entity_field_definitions.profile_path

alter table public.clients
  add column if not exists entity_profile jsonb not null default '{}'::jsonb;

comment on column public.clients.entity_profile is
  'Normalized company facts + provenance. Auto-harvested from documents; used by autofill and data export.';

-- Backfill skeleton from formation_draft where profile empty
update public.clients
set entity_profile = jsonb_build_object(
  'version', 1,
  'updated_at', now(),
  'updated_by', 'migration',
  'facts', jsonb_build_object(
    'legal_name', coalesce(formation_draft->>'proposed_company_name', company_name, ''),
    'registered_office', jsonb_build_object(
      'line1', coalesce(formation_draft->>'registered_office_address', '')
    ),
    'authorized_share_capital', coalesce(formation_draft->>'authorized_share_capital', ''),
    'directors', coalesce(formation_draft->'directors', '[]'::jsonb),
    'shareholders', coalesce(formation_draft->'shareholders', '[]'::jsonb)
  ),
  'provenance', '{}'::jsonb
)
where entity_profile = '{}'::jsonb
  and (
    formation_draft is not null and formation_draft <> '{}'::jsonb
    or company_name is not null
  );