alter table public.messages
  add column if not exists thread text not null default 'team',
  add column if not exists share_with_admin boolean not null default true;

update public.messages
  set thread = 'assistant'
  where is_ai_generated = true and thread = 'team';

create index if not exists messages_dispatch_idx
  on public.messages(created_at)
  where sent_at is null;