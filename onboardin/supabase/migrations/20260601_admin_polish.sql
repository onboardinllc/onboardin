-- Admin internal notes per client
alter table public.clients
  add column if not exists internal_notes text;

-- Link documents to onboarding steps (deliverables)
alter table public.documents
  add column if not exists step_index int;

-- Unread message tracking
alter table public.clients
  add column if not exists last_message_at timestamptz default now(),
  add column if not exists admin_last_read_at timestamptz default now(),
  add column if not exists client_last_read_at timestamptz default now();

-- Trigger to update last_message_at on clients table
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
