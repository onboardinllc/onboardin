-- SCAFFOLD — NOT YET ENABLED. Authored for future implementation.
-- Per-client audit log. Every admin action that touches a client's profile, documents,
-- onboarding step, lifecycle status, or messages should write a row here.
-- Use a Postgres trigger on the affected tables or write from the app explicitly.
--
-- Run this only when the "Audit Log" feature is being implemented.

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  actor_id uuid references auth.users(id),
  -- e.g. 'step_advanced', 'step_rolled_back', 'lifecycle_changed', 'document_uploaded',
  --      'internal_note_updated', 'credits_boosted', 'message_sent'
  action text not null,
  -- before/after snapshot for the action (any shape)
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_client_id_idx on public.audit_log (client_id, created_at desc);
create index if not exists audit_log_actor_id_idx on public.audit_log (actor_id);

alter table public.audit_log enable row level security;
create policy "audit: admin read" on public.audit_log for select using (public.is_admin());
create policy "audit: admin write" on public.audit_log for insert with check (public.is_admin());
