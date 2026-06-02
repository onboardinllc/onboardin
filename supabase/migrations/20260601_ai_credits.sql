-- AI Credit and Privacy Updates
alter table public.clients
  add column if not exists daily_ai_credits int not null default 3,
  add column if not exists last_credit_refresh timestamptz not null default now(),
  add column if not exists share_ai_data boolean not null default false;

-- Message tagging (AI vs Human)
alter table public.messages
  add column if not exists is_ai_generated boolean not null default false;

-- Function to handle daily credit refresh
create or replace function public.refresh_client_credits()
returns void language plpgsql security definer as $$
begin
  update public.clients
  set 
    daily_ai_credits = 3,
    last_credit_refresh = now()
  where last_credit_refresh < date_trunc('day', now());
end;
$$;
