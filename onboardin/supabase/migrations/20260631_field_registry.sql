-- Admin-managed field registry + per-template document catalogs (profile autofill plan)
-- Source of truth for canonical keys and exhaustive per-document field lists.

-- ─── Canonical registry ───────────────────────────────────────────────────────

create table if not exists public.entity_field_definitions (
  id uuid primary key default gen_random_uuid(),
  registry_key text not null,
  label text not null,
  group_name text not null,
  data_type text not null default 'string',
  repeat_group text,
  jurisdiction text,
  entity_type text,
  assistant_eligible boolean not null default false,
  ui_collect boolean not null default true,
  profile_path text not null,
  active boolean not null default true,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists entity_field_definitions_key_scope_idx
  on public.entity_field_definitions (
    registry_key,
    coalesce(jurisdiction, ''),
    coalesce(entity_type, '')
  );

alter table public.entity_field_definitions enable row level security;

drop policy if exists "entity_field_definitions: read authenticated" on public.entity_field_definitions;
create policy "entity_field_definitions: read authenticated"
  on public.entity_field_definitions for select to authenticated using (true);

drop policy if exists "entity_field_definitions: admin write" on public.entity_field_definitions;
create policy "entity_field_definitions: admin write"
  on public.entity_field_definitions for all using (public.is_admin());

-- ─── Per-document field catalog ───────────────────────────────────────────────

create table if not exists public.template_field_catalog (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.legal_templates(id) on delete cascade,
  field_key text not null,
  pdf_label text,
  page int,
  field_type text not null default 'text',
  pdf_target jsonb not null default '{}'::jsonb,
  registry_key text,
  repeat_index int,
  required boolean not null default false,
  active boolean not null default true,
  catalog_version text not null default '2026-06',
  updated_at timestamptz not null default now(),
  unique (template_id, field_key)
);

create index if not exists template_field_catalog_template_idx
  on public.template_field_catalog (template_id);

alter table public.template_field_catalog enable row level security;

drop policy if exists "template_field_catalog: read authenticated" on public.template_field_catalog;
create policy "template_field_catalog: read authenticated"
  on public.template_field_catalog for select to authenticated using (true);

drop policy if exists "template_field_catalog: admin write" on public.template_field_catalog;
create policy "template_field_catalog: admin write"
  on public.template_field_catalog for all using (public.is_admin());

-- ─── Audit trail ──────────────────────────────────────────────────────────────

create table if not exists public.field_registry_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  actor_type text not null,
  action text not null,
  table_name text not null,
  record_id uuid,
  diff jsonb,
  created_at timestamptz not null default now()
);

alter table public.field_registry_audit enable row level security;

drop policy if exists "field_registry_audit: admin read" on public.field_registry_audit;
create policy "field_registry_audit: admin read"
  on public.field_registry_audit for select using (public.is_admin());

drop policy if exists "field_registry_audit: admin insert" on public.field_registry_audit;
create policy "field_registry_audit: admin insert"
  on public.field_registry_audit for insert with check (public.is_admin());

-- ─── Publish: catalog → legal_templates.placeholder_map + field_map ───────────

create or replace function public.publish_template_maps(p_template_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_placeholder_map jsonb := '{}'::jsonb;
  v_field_map jsonb := '{}'::jsonb;
  v_row record;
  v_source text;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  for v_row in
    select
      c.field_key,
      c.registry_key,
      c.pdf_target,
      d.profile_path,
      d.data_type
    from public.template_field_catalog c
    left join public.entity_field_definitions d
      on d.registry_key = c.registry_key
      and d.active = true
    where c.template_id = p_template_id
      and c.active = true
      and c.registry_key is not null
  loop
    v_source := case
      when v_row.profile_path like 'clients.%' then v_row.profile_path
      when v_row.profile_path is not null then 'entity_profile.' || v_row.profile_path
      else 'formation_draft.' || v_row.registry_key
    end;

    v_placeholder_map := v_placeholder_map || jsonb_build_object(
      v_row.field_key,
      jsonb_build_object('source', v_source)
    );

    if v_row.pdf_target is not null and v_row.pdf_target <> '{}'::jsonb then
      v_field_map := v_field_map || jsonb_build_object(
        v_row.field_key,
        v_row.pdf_target || jsonb_build_object('type', coalesce(v_row.data_type, 'text'))
      );
    end if;
  end loop;

  update public.legal_templates
  set placeholder_map = v_placeholder_map,
      field_map = v_field_map
  where id = p_template_id;

  insert into public.field_registry_audit (actor_id, actor_type, action, table_name, record_id, diff)
  values (
    auth.uid(),
    'admin',
    'publish',
    'legal_templates',
    p_template_id,
    jsonb_build_object('placeholder_map', v_placeholder_map, 'field_map', v_field_map)
  );

  return jsonb_build_object('placeholder_map', v_placeholder_map, 'field_map', v_field_map);
end;
$$;

revoke all on function public.publish_template_maps(uuid) from public;
grant execute on function public.publish_template_maps(uuid) to authenticated;

-- ─── Seed: Jamaica Ltd COJ canonical keys (v1) ────────────────────────────────

insert into public.entity_field_definitions
  (registry_key, label, group_name, data_type, profile_path, jurisdiction, entity_type, assistant_eligible, ui_collect)
values
  ('legal_name', 'Proposed company name', 'company', 'string', 'legal_name', 'Jamaica', 'Ltd', false, true),
  ('applicant.name', 'Applicant name', 'applicant', 'string', 'applicant.name', 'Jamaica', 'Ltd', false, true),
  ('applicant.address', 'Applicant address', 'applicant', 'string', 'applicant.address', 'Jamaica', 'Ltd', false, true),
  ('applicant.phone', 'Contact phone', 'applicant', 'string', 'applicant.phone', 'Jamaica', 'Ltd', false, true),
  ('applicant.fax', 'Fax number', 'applicant', 'string', 'applicant.fax', 'Jamaica', 'Ltd', false, true),
  ('applicant.email', 'Email address', 'applicant', 'string', 'applicant.email', 'Jamaica', 'Ltd', false, true),
  ('applicant.relation_to_company', 'Relation to company', 'applicant', 'string', 'applicant.relation_to_company', 'Jamaica', 'Ltd', false, true),
  ('registered_office.line1', 'Registered office (line 1)', 'registered_office', 'string', 'registered_office.line1', 'Jamaica', 'Ltd', false, true),
  ('authorized_share_capital', 'Authorized share capital', 'company', 'string', 'authorized_share_capital', 'Jamaica', 'Ltd', false, true),
  ('reservation_date', 'Reservation date', 'filing', 'date', 'reservation_date', 'Jamaica', 'Ltd', false, false),
  ('proposed_names.alt_1', 'Alternate proposed name 1', 'company', 'string', 'proposed_names.0', 'Jamaica', 'Ltd', false, true),
  ('proposed_names.alt_2', 'Alternate proposed name 2', 'company', 'string', 'proposed_names.1', 'Jamaica', 'Ltd', false, true),
  ('directors.name', 'Director name', 'directors', 'string', 'directors[].name', 'Jamaica', 'Ltd', false, true),
  ('directors.address', 'Director address', 'directors', 'string', 'directors[].address', 'Jamaica', 'Ltd', false, true),
  ('directors.trn', 'Director TRN', 'directors', 'string', 'directors[].trn', 'Jamaica', 'Ltd', false, true),
  ('shareholders.name', 'Shareholder name', 'shareholders', 'string', 'shareholders[].name', 'Jamaica', 'Ltd', false, true),
  ('shareholders.address', 'Shareholder address', 'shareholders', 'string', 'shareholders[].address', 'Jamaica', 'Ltd', false, true),
  ('shareholders.trn', 'Shareholder TRN', 'shareholders', 'string', 'shareholders[].trn', 'Jamaica', 'Ltd', false, true),
  ('shareholders.shares', 'Shareholder shares', 'shareholders', 'string', 'shareholders[].shares', 'Jamaica', 'Ltd', false, true),
  ('bor_notes', 'BOR notes', 'filing', 'text', 'bor_notes', 'Jamaica', 'Ltd', true, true),
  ('founder_name', 'Founder name', 'account', 'string', 'founder_name', null, null, false, false)
on conflict do nothing;

-- ─── Seed: Form 6 catalog rows (maps to current 20260628 acro targets) ────────

insert into public.template_field_catalog
  (template_id, field_key, pdf_label, page, field_type, pdf_target, registry_key, catalog_version)
select
  t.id,
  v.field_key,
  v.pdf_label,
  v.page,
  v.field_type,
  v.pdf_target::jsonb,
  v.registry_key,
  '2026-06'
from public.legal_templates t
cross join (values
  ('proposed_company_name', 'Form 6 §4', 0, 'text', '{"acroIndex": 15}', 'legal_name'),
  ('applicant_name', 'Form 6 §1', 0, 'text', '{"acroIndex": 7}', 'applicant.name'),
  ('applicant_address', 'Form 6 §3', 0, 'text', '{"acroIndex": 9}', 'applicant.address'),
  ('reservation_date', 'Form 6 date received', 0, 'date', '{"acroIndices": [0, 1, 2]}', 'reservation_date')
) as v(field_key, pdf_label, page, field_type, pdf_target, registry_key)
where t.kind = 'coj_form_6' and t.provider = 'coj'
on conflict (template_id, field_key) do update set
  pdf_target = excluded.pdf_target,
  registry_key = excluded.registry_key,
  updated_at = now();

-- Pending catalog placeholders (admin completes via panel or PR0 import)
insert into public.template_field_catalog
  (template_id, field_key, pdf_label, page, field_type, pdf_target, registry_key, active, catalog_version)
select t.id, v.field_key, v.pdf_label, 0, 'text', '{}'::jsonb, v.registry_key, false, '2026-06-pending'
from public.legal_templates t
cross join (values
  ('contact_phone', 'Form 6 §2', 'applicant.phone'),
  ('contact_fax', 'Form 6 §2A', 'applicant.fax'),
  ('contact_email', 'Form 6 §2B', 'applicant.email'),
  ('relation_to_company', 'Form 6 §3A', 'applicant.relation_to_company'),
  ('proposed_name_alt_1', 'Form 6 §4A', 'proposed_names.alt_1'),
  ('proposed_name_alt_2', 'Form 6 §4A', 'proposed_names.alt_2')
) as v(field_key, pdf_label, registry_key)
where t.kind = 'coj_form_6' and t.provider = 'coj'
on conflict (template_id, field_key) do nothing;