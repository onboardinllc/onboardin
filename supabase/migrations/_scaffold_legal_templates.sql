/*-- scaf --
  IP & Contract Templates library — for step 4 of the onboarding pipeline.
  Templates per jurisdiction × entity type × document kind (work-for-hire, NDA,
  contractor agreement, IP assignment). Client downloads a pre-filled template
  via signed URL or e-sign integration.

  Run this only when the "IP & Contract Templates" feature is being implemented.
*/

create table if not exists public.legal_templates (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  entity_type text not null,
  -- e.g. 'work_for_hire', 'nda_mutual', 'contractor_agreement', 'ip_assignment'
  kind text not null,
  label text not null,
  -- storage path to the master template (.docx or .pdf with placeholders)
  template_path text not null,
  -- jsonb mapping placeholder name → source field on public.clients
  placeholder_map jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists legal_templates_jurisdiction_idx on public.legal_templates (jurisdiction, entity_type);

alter table public.legal_templates enable row level security;
create policy "legal_templates: anyone read active" on public.legal_templates for select using (active);
create policy "legal_templates: admin all" on public.legal_templates for all using (public.is_admin());

-- Per-client generated documents from templates
create table if not exists public.client_legal_docs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  template_id uuid not null references public.legal_templates(id),
  generated_path text not null,
  -- 'draft' | 'signed' | 'voided'
  status text not null default 'draft',
  signed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists client_legal_docs_client_idx on public.client_legal_docs (client_id);

alter table public.client_legal_docs enable row level security;
create policy "client_legal_docs: client own" on public.client_legal_docs for all using (client_id = auth.uid());
create policy "client_legal_docs: admin all" on public.client_legal_docs for all using (public.is_admin());
