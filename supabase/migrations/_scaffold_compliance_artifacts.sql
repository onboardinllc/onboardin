/*-- scaf --
  Privacy & Compliance artifacts — for step 5 of the onboarding pipeline.
  Tracks privacy policy, DPA, cookie consent records, and jurisdiction-specific
  compliance items (e.g. Jamaica Data Protection Act, EU GDPR, CCPA).
  Versioned via effective_at — old versions kept for audit.

  Run this only when the "Privacy & Compliance" feature is being implemented.
*/

create table if not exists public.compliance_artifacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  -- e.g. 'privacy_policy', 'dpa', 'cookie_consent_config', 'terms_of_service',
  --      'jamaica_dpa_2020_registration', 'gdpr_dpo_appointment'
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
  created_at timestamptz not null default now()
);

create index if not exists compliance_artifacts_client_idx on public.compliance_artifacts (client_id, status);
create index if not exists compliance_artifacts_effective_idx on public.compliance_artifacts (effective_at desc);

alter table public.compliance_artifacts enable row level security;
create policy "compliance: client own" on public.compliance_artifacts for all using (client_id = auth.uid());
create policy "compliance: admin all" on public.compliance_artifacts for all using (public.is_admin());
