/*-- scaf --
  Business Banking partners — for step 3 of the onboarding pipeline.
  Banks per jurisdiction (NCB, Sagicor, BNS Jamaica for Jamaica; Mercury,
  Chase, SVB for US, etc.) with requirements and a process URL for the client
  to start an application. The Banking step in the dashboard surfaces a
  filtered list of banks based on the client's country/entity_type.

  Run this only when the "Business Banking" feature is being implemented.
*/

create table if not exists public.banking_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  jurisdiction text not null,
  -- minimum entity types this bank serves: ARRAY of strings like ['LLC','C-Corp','Limited Company (Ltd)']
  supports_entities text[] not null default array[]::text[],
  -- jurisdictional minimum funding stage (some banks only take seed+, some take pre-seed)
  min_funding_stage text,
  -- short description: what the bank is known for in this market
  description text,
  -- URL to start an application (or a partner-referral link)
  application_url text not null,
  -- documents required to open an account
  required_docs text[] not null default array[]::text[],
  -- minimum opening balance in USD (or null if none)
  minimum_balance_usd int,
  -- typical time-to-approval in days
  typical_approval_days int,
  -- referral commission Onboardin earns per signup (USD, optional)
  referral_commission_usd int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists banking_partners_jurisdiction_idx on public.banking_partners (jurisdiction, active);

alter table public.banking_partners enable row level security;
create policy "banks: anyone read active" on public.banking_partners for select using (active);
create policy "banks: admin all" on public.banking_partners for all using (public.is_admin());

-- Per-client banking application tracking
create table if not exists public.client_bank_applications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  bank_id uuid not null references public.banking_partners(id),
  -- 'started' | 'docs_submitted' | 'under_review' | 'approved' | 'rejected'
  status text not null default 'started',
  -- account number (encrypted at rest preferred; or stored externally and only referenced)
  account_reference text,
  started_at timestamptz not null default now(),
  approved_at timestamptz,
  notes text
);

create index if not exists client_bank_apps_client_idx on public.client_bank_applications (client_id);

alter table public.client_bank_applications enable row level security;
create policy "bank_apps: client own" on public.client_bank_applications for all using (client_id = auth.uid());
create policy "bank_apps: admin all" on public.client_bank_applications for all using (public.is_admin());
