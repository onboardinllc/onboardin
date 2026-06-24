-- Consolidated catch-up migration: adds every column referenced by the app
-- but missing from the live DB (Sessions 6, 7, 8, 10 migrations were never run).
-- Idempotent - safe to re-run.

-- Session 6: billing
alter table public.clients
  add column if not exists plan text default 'starter',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

-- Session 7: jurisdiction + entity intake
alter table public.clients
  add column if not exists country text,
  add column if not exists jurisdiction text,
  add column if not exists entity_type text,
  add column if not exists business_intent text,
  add column if not exists sells_to text;

-- Session 7: document category tagging
alter table public.documents
  add column if not exists category text;

-- Session 8: domain + workspace
alter table public.clients
  add column if not exists domain text,
  add column if not exists domain_owned boolean,
  add column if not exists domain_registered_at timestamptz,
  add column if not exists workspace_plan text,
  add column if not exists workspace_seats int,
  add column if not exists workspace_domain text;

-- Session 10: admin polish (internal notes, deliverables, unread tracking)
alter table public.clients
  add column if not exists internal_notes text,
  add column if not exists last_message_at timestamptz default now(),
  add column if not exists admin_last_read_at timestamptz default now(),
  add column if not exists client_last_read_at timestamptz default now();

alter table public.documents
  add column if not exists step_index int;

-- Session 10: message-insert trigger to bump last_message_at
create or replace function public.update_last_message_at()
returns trigger language plpgsql security definer as $$
begin
  update public.clients
  set last_message_at = now()
  where id = new.client_id;
  return new;
end;
$$;

drop trigger if exists on_message_inserted on public.messages;
create trigger on_message_inserted
  after insert on public.messages
  for each row execute function public.update_last_message_at();

-- Session 7: update the signup trigger so new columns get populated from auth metadata
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
