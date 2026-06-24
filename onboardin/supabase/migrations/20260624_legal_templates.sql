-- Auto-Sign document layer (Ticket #09) - vault template registry, fill jobs,
-- member signature PNGs. v1: Assistant fill from company context + in-app sign
-- overlay. Phase E (deferred): external_envelope_id for DocuSign adapter.

create table if not exists public.legal_templates (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  entity_type text not null,
  kind text not null,
  label text not null,
  vault_card_id text,
  template_path text not null,
  placeholder_map jsonb not null default '{}'::jsonb,
  field_map jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists legal_templates_jurisdiction_idx
  on public.legal_templates (jurisdiction, entity_type);

create unique index if not exists legal_templates_card_kind_entity_jurisdiction_idx
  on public.legal_templates (vault_card_id, kind, entity_type, jurisdiction);

alter table public.legal_templates enable row level security;

create policy "legal_templates: anyone read active"
  on public.legal_templates for select
  using (active);

create policy "legal_templates: admin all"
  on public.legal_templates for all
  using (public.is_admin());

-- Member signature image (one active PNG per user in v1)
create table if not exists public.member_signatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  mime_type text not null default 'image/png',
  active boolean not null default true,
  uploaded_at timestamptz not null default now()
);

create unique index if not exists member_signatures_active_user_idx
  on public.member_signatures (user_id) where active;

alter table public.member_signatures enable row level security;

create policy "member_signatures: own"
  on public.member_signatures for all
  using (user_id = auth.uid());

create policy "member_signatures: admin read"
  on public.member_signatures for select
  using (public.is_admin());

-- Fill/sign session per template
create table if not exists public.document_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  template_id uuid not null references public.legal_templates(id),
  status text not null default 'context_preview',
  filled_path text,
  signed_path text,
  filled_by text,
  field_values jsonb not null default '{}'::jsonb,
  credits_charged int not null default 0,
  field_placements jsonb not null default '[]'::jsonb,
  admin_user_id uuid references auth.users(id),
  external_envelope_id text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_jobs_client_idx on public.document_jobs (client_id);
create index if not exists document_jobs_template_idx on public.document_jobs (template_id);

-- One active job per (client_id, template_id) - upsert by id
create unique index if not exists document_jobs_active_pair_idx
  on public.document_jobs (client_id, template_id)
  where (status != 'voided');

alter table public.document_jobs enable row level security;

create policy "document_jobs: client own"
  on public.document_jobs for all
  using (client_id = auth.uid());

create policy "document_jobs: admin all"
  on public.document_jobs for all
  using (public.is_admin());

grant execute on function public.is_admin() to authenticated;

-- formation_draft: client-editable context for resolveCompanyContext
alter table public.clients
  add column if not exists formation_draft jsonb not null default '{}'::jsonb;

-- Seed legal_templates rows
insert into public.legal_templates
  (jurisdiction, entity_type, kind, label, vault_card_id, template_path, placeholder_map, field_map)
values
  (
    'all',
    'all',
    'founder_agreement',
    'Founder Agreement',
    'founder_docs',
    'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/templates/founder-agreement-v1.pdf',
    '{
      "company_name":    {"source": "clients.company_name"},
      "founder_name":    {"source": "clients.founder_name"},
      "effective_date":  {"source": "computed.today"},
      "governing_law":   {"source": "computed.governing_law", "llm": true}
    }'::jsonb,
    '{
      "founder_signature": {"page": 0, "x": 72,  "y": 120, "w": 200, "h": 48,  "type": "signature"},
      "effective_date":    {"page": 0, "x": 72,  "y": 200, "w": 120, "h": 24,  "type": "date"},
      "company_name":      {"page": 0, "x": 72,  "y": 680, "w": 300, "h": 24,  "type": "text"},
      "founder_name":      {"page": 0, "x": 72,  "y": 656, "w": 300, "h": 24,  "type": "text"},
      "governing_law":     {"page": 0, "x": 72,  "y": 632, "w": 300, "h": 24,  "type": "text"}
    }'::jsonb
  ),
  (
    'all',
    'LLC',
    'operating_agreement',
    'Operating Agreement',
    'operating_agreement',
    'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/templates/llc-operating-agreement.pdf',
    '{
      "company_name":   {"source": "clients.company_name"},
      "founder_name":   {"source": "clients.founder_name"},
      "effective_date": {"source": "computed.today"},
      "state":          {"source": "clients.jurisdiction"}
    }'::jsonb,
    '{
      "founder_signature": {"page": 0, "x": 72, "y": 120, "w": 200, "h": 48, "type": "signature"},
      "effective_date":    {"page": 0, "x": 72, "y": 200, "w": 120, "h": 24, "type": "date"},
      "company_name":      {"page": 0, "x": 72, "y": 680, "w": 300, "h": 24, "type": "text"},
      "state":             {"page": 0, "x": 72, "y": 656, "w": 300, "h": 24, "type": "text"}
    }'::jsonb
  ),
  (
    'all',
    'S-Corp',
    'operating_agreement',
    'Operating Agreement',
    'operating_agreement',
    'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/templates/llc-operating-agreement.pdf',
    '{
      "company_name":   {"source": "clients.company_name"},
      "founder_name":   {"source": "clients.founder_name"},
      "effective_date": {"source": "computed.today"},
      "state":          {"source": "clients.jurisdiction"}
    }'::jsonb,
    '{
      "founder_signature": {"page": 0, "x": 72, "y": 120, "w": 200, "h": 48, "type": "signature"},
      "effective_date":    {"page": 0, "x": 72, "y": 200, "w": 120, "h": 24, "type": "date"},
      "company_name":      {"page": 0, "x": 72, "y": 680, "w": 300, "h": 24, "type": "text"},
      "state":             {"page": 0, "x": 72, "y": 656, "w": 300, "h": 24, "type": "text"}
    }'::jsonb
  ),
  (
    'all',
    'C-Corp',
    'corp_bylaws',
    'Corporate Bylaws',
    'operating_agreement',
    'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/templates/corp-bylaws.pdf',
    '{
      "company_name":   {"source": "clients.company_name"},
      "founder_name":   {"source": "clients.founder_name"},
      "effective_date": {"source": "computed.today"},
      "state":          {"source": "clients.jurisdiction"}
    }'::jsonb,
    '{
      "founder_signature": {"page": 0, "x": 72, "y": 120, "w": 200, "h": 48, "type": "signature"},
      "effective_date":    {"page": 0, "x": 72, "y": 200, "w": 120, "h": 24, "type": "date"},
      "company_name":      {"page": 0, "x": 72, "y": 680, "w": 300, "h": 24, "type": "text"},
      "state":             {"page": 0, "x": 72, "y": 656, "w": 300, "h": 24, "type": "text"}
    }'::jsonb
  ),
  (
    'Jamaica',
    'Ltd',
    'jm_shareholders_agreement',
    'Shareholders Agreement',
    'operating_agreement',
    'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/templates/jm-shareholders-agreement.pdf',
    '{
      "company_name":   {"source": "clients.company_name"},
      "founder_name":   {"source": "clients.founder_name"},
      "effective_date": {"source": "computed.today"}
    }'::jsonb,
    '{
      "founder_signature": {"page": 0, "x": 72, "y": 120, "w": 200, "h": 48, "type": "signature"},
      "effective_date":    {"page": 0, "x": 72, "y": 200, "w": 120, "h": 24, "type": "date"},
      "company_name":      {"page": 0, "x": 72, "y": 680, "w": 300, "h": 24, "type": "text"}
    }'::jsonb
  ),
  (
    'all',
    'C-Corp',
    'stock_purchase_agreement',
    'Founder Stock Purchase Agreement',
    'founder_stock',
    'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/templates/stock-purchase-agreement.pdf',
    '{
      "company_name":   {"source": "clients.company_name"},
      "founder_name":   {"source": "clients.founder_name"},
      "effective_date": {"source": "computed.today"},
      "state":          {"source": "clients.jurisdiction"}
    }'::jsonb,
    '{
      "founder_signature": {"page": 0, "x": 72, "y": 120, "w": 200, "h": 48, "type": "signature"},
      "effective_date":    {"page": 0, "x": 72, "y": 200, "w": 120, "h": 24, "type": "date"},
      "company_name":      {"page": 0, "x": 72, "y": 680, "w": 300, "h": 24, "type": "text"},
      "state":             {"page": 0, "x": 72, "y": 656, "w": 300, "h": 24, "type": "text"}
    }'::jsonb
  )
on conflict (vault_card_id, kind, entity_type, jurisdiction) do nothing;
