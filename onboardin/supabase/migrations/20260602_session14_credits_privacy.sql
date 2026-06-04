-- Session 14: daily AI credits, AI data privacy toggle, AI-generated message tagging
-- Idempotent — safe to re-run. Includes the Session 6/7/8/10 catch-up columns
-- in case the consolidated migration was never executed.

-- Catch-up (Sessions 6, 7, 8, 10): only adds what's missing
alter table public.clients
  add column if not exists plan text default 'starter',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists country text,
  add column if not exists jurisdiction text,
  add column if not exists entity_type text,
  add column if not exists business_intent text,
  add column if not exists sells_to text,
  add column if not exists domain text,
  add column if not exists domain_owned boolean,
  add column if not exists domain_registered_at timestamptz,
  add column if not exists workspace_plan text,
  add column if not exists workspace_seats int,
  add column if not exists workspace_domain text,
  add column if not exists internal_notes text,
  add column if not exists last_message_at timestamptz default now(),
  add column if not exists admin_last_read_at timestamptz default now(),
  add column if not exists client_last_read_at timestamptz default now();

alter table public.documents
  add column if not exists category text,
  add column if not exists step_index int;

-- Session 14: AI credit + privacy columns
alter table public.clients
  add column if not exists daily_ai_credits int not null default 3,
  add column if not exists last_credit_refresh timestamptz default now(),
  add column if not exists share_ai_data boolean not null default false;

alter table public.messages
  add column if not exists is_ai_generated boolean not null default false;

-- Message-insert trigger (from Session 10): bumps last_message_at on the client row
create or replace function public.update_last_message_at()
returns trigger language plpgsql security definer as $$
begin
  update public.clients set last_message_at = now() where id = new.client_id;
  return new;
end;
$$;

drop trigger if exists on_message_inserted on public.messages;
create trigger on_message_inserted
  after insert on public.messages
  for each row execute function public.update_last_message_at();

-- Signup trigger update — populate Session 7 columns from auth metadata on signup
create or replace function public.handle_new_client()
returns trigger language plpgsql security definer as $$
begin
  insert into public.clients (
    id, email, company_name, founder_name, funding_stage,
    country, jurisdiction, entity_type, business_intent, sells_to,
    domain, domain_owned, workspace_plan, workspace_seats
  )
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'company_name', ''),
    coalesce(new.raw_user_meta_data->>'founder_name', ''),
    coalesce(new.raw_user_meta_data->>'funding_stage', ''),
    new.raw_user_meta_data->>'country',
    new.raw_user_meta_data->>'jurisdiction',
    new.raw_user_meta_data->>'entity_type',
    new.raw_user_meta_data->>'business_intent',
    new.raw_user_meta_data->>'sells_to',
    new.raw_user_meta_data->>'domain',
    (new.raw_user_meta_data->>'domain_owned')::boolean,
    new.raw_user_meta_data->>'workspace_plan',
    (new.raw_user_meta_data->>'workspace_seats')::int
  );
  return new;
end;
$$;
