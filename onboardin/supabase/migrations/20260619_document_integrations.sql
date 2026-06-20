-- Ticket #06: tiered Google Drive storage (Starter = Drive primary; Growth = optional Supabase).
-- Phase A prep: schema only. OAuth edge handlers stubbed until compliance § Prerequisites (#10).

-- Per-document storage leg(s)
alter table public.documents
  add column if not exists storage_provider text not null default 'supabase'
    check (storage_provider in ('supabase', 'gdrive', 'both')),
  add column if not exists drive_file_id text,
  add column if not exists drive_web_view_link text,
  add column if not exists drive_folder_path text,
  add column if not exists drive_uploaded_at timestamptz;

comment on column public.documents.storage_provider is
  'supabase = bytes in client-documents only. gdrive = Drive only (Starter). both = Drive + Supabase mirror (Growth).';
comment on column public.documents.drive_folder_path is
  'Relative path under Onboardin/{company_slug}/ per scaffolds/data/drive-vault-category-map.json';

-- Plan-aware default set at signup (trigger or app), not by column default alone
alter table public.clients
  add column if not exists storage_mode text not null default 'supabase'
    check (storage_mode in ('drive', 'supabase', 'both'));

comment on column public.clients.storage_mode is
  'Starter signup → drive. Growth signup → both (user may switch to drive or supabase only). Column default is legacy until #06 ships.';

-- OAuth connection metadata (client-readable; no secrets)
create table if not exists public.client_integrations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null check (provider in ('google_drive')),
  account_type text not null default 'workspace' check (account_type in ('workspace', 'gmail')),
  drive_root_folder_id text,
  company_slug text,
  drive_folder_map jsonb not null default '{}'::jsonb,
  export_job_status jsonb,
  connected_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (client_id, provider)
);

comment on column public.client_integrations.drive_folder_map is
  'Subfolder name → Google Drive folder id. Keys match drive-vault-category-map.json.';

-- OAuth secrets: service role only (no authenticated policies = deny via RLS)
create table if not exists public.client_integration_secrets (
  integration_id uuid primary key references public.client_integrations(id) on delete cascade,
  refresh_token_encrypted text not null,
  updated_at timestamptz not null default now()
);

alter table public.client_integrations enable row level security;
alter table public.client_integration_secrets enable row level security;

grant execute on function public.is_admin() to authenticated;

drop policy if exists "clients select own integrations" on public.client_integrations;
drop policy if exists "clients insert own integrations" on public.client_integrations;
drop policy if exists "clients update own integrations" on public.client_integrations;
drop policy if exists "clients delete own integrations" on public.client_integrations;
drop policy if exists "integrations: admin select" on public.client_integrations;

create policy "clients select own integrations"
  on public.client_integrations for select
  to authenticated
  using (client_id = auth.uid());

create policy "clients insert own integrations"
  on public.client_integrations for insert
  to authenticated
  with check (client_id = auth.uid());

create policy "clients update own integrations"
  on public.client_integrations for update
  to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

create policy "clients delete own integrations"
  on public.client_integrations for delete
  to authenticated
  using (client_id = auth.uid());

create policy "integrations: admin select"
  on public.client_integrations for select
  to authenticated
  using (public.is_admin());

-- No policies on client_integration_secrets: edge functions use service role only.