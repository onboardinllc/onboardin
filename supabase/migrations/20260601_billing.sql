-- Billing columns
alter table public.clients
  add column if not exists plan text not null default 'starter',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create index if not exists clients_stripe_customer_id_idx on public.clients (stripe_customer_id);

-- Jurisdiction + entity columns
alter table public.clients
  add column if not exists country text,
  add column if not exists jurisdiction text,
  add column if not exists entity_type text,
  add column if not exists business_intent text,
  add column if not exists sells_to text;

-- Document category column
alter table public.documents
  add column if not exists category text;

-- Domain + workspace columns
alter table public.clients
  add column if not exists domain text,
  add column if not exists domain_owned boolean,
  add column if not exists domain_registered_at timestamptz,
  add column if not exists workspace_plan text,
  add column if not exists workspace_seats int,
  add column if not exists workspace_domain text;
