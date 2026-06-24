-- Privacy & Compliance artifacts - pipeline step 6 (0-indexed step 5).
-- Tracks privacy policy, DPA, cookie consent records, and jurisdiction-specific
-- compliance items (e.g. Jamaica Data Protection Act, EU GDPR, CCPA).
-- Versioned via effective_at - old versions kept for audit.

create table if not exists public.compliance_artifacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
 -- e.g. 'privacy_policy', 'dpa', 'cookie_consent_config', 'terms_of_service',
 -- 'jamaica_dpa_2020_registration', 'gdpr_dpo_appointment'
  kind text not null,
  label text not null,
 -- jurisdiction this artifact addresses (or 'multi' for cross-border)
  jurisdiction text not null default 'multi',
 -- storage path to the published artifact
  artifact_path text,
 -- public URL for hosted docs (e.g. /privacy on the client's site)
  hosted_url text,
  effective_at timestamptz not null default now(),
 -- 'draft' | 'active' | 'superseded' | 'expired'
  status text not null default 'draft',
 -- how the artifact was created: 'termly_manual', 'upload', 'admin'
  source text,
 -- compliance procedure slug + version date used when artifact was created
  procedure_version text,
  created_at timestamptz not null default now()
);

create index if not exists compliance_artifacts_client_idx on public.compliance_artifacts (client_id, status);
create index if not exists compliance_artifacts_effective_idx on public.compliance_artifacts (effective_at desc);

alter table public.compliance_artifacts enable row level security;

grant execute on function public.is_admin() to authenticated;

drop policy if exists "compliance: client select" on public.compliance_artifacts;
drop policy if exists "compliance: client insert" on public.compliance_artifacts;
drop policy if exists "compliance: client update" on public.compliance_artifacts;
drop policy if exists "compliance: client delete" on public.compliance_artifacts;
drop policy if exists "compliance: admin select" on public.compliance_artifacts;
drop policy if exists "compliance: admin insert" on public.compliance_artifacts;
drop policy if exists "compliance: admin update" on public.compliance_artifacts;
drop policy if exists "compliance: admin delete" on public.compliance_artifacts;

create policy "compliance: client select"
  on public.compliance_artifacts for select
  to authenticated
  using (client_id = auth.uid());

create policy "compliance: client insert"
  on public.compliance_artifacts for insert
  to authenticated
  with check (client_id = auth.uid());

create policy "compliance: client update"
  on public.compliance_artifacts for update
  to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

create policy "compliance: client delete"
  on public.compliance_artifacts for delete
  to authenticated
  using (client_id = auth.uid());

create policy "compliance: admin select"
  on public.compliance_artifacts for select
  to authenticated
  using (public.is_admin());

create policy "compliance: admin insert"
  on public.compliance_artifacts for insert
  to authenticated
  with check (public.is_admin());

create policy "compliance: admin update"
  on public.compliance_artifacts for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "compliance: admin delete"
  on public.compliance_artifacts for delete
  to authenticated
  using (public.is_admin());