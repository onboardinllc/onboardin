alter table public.messages
  add column if not exists scheduled_at timestamptz null,
  add column if not exists send_email boolean not null default false,
  add column if not exists email_subject text null,
  add column if not exists sent_at timestamptz null,
  add column if not exists metadata jsonb null;

create index if not exists messages_scheduled_idx
  on public.messages(scheduled_at)
  where scheduled_at is not null and sent_at is null;
