-- SCAFFOLD — NOT YET ENABLED. Authored for future implementation.
-- Recurring compliance obligations tracker for the maintenance phase.
-- A client in 'active' lifecycle has obligations like annual report, franchise tax, BOI/CTA, registered agent renewal.
-- Each obligation has a due date and a status. Admin sees overdue/upcoming in the action queue.
--
-- Run this only when the "Recurring Obligations Tracker" feature is being implemented.

create table if not exists public.obligations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  -- e.g. 'annual_report', 'franchise_tax', 'boi_cta', 'registered_agent', 'gross_receipts_tax'
  kind text not null,
  -- human-readable label shown to admin/client
  label text not null,
  -- jurisdiction this obligation applies to (e.g. 'Delaware', 'Jamaica')
  jurisdiction text,
  -- when it's due
  due_at timestamptz not null,
  -- recurrence: 'annual', 'quarterly', 'monthly', 'one_time'
  recurrence text not null default 'annual',
  -- status: 'upcoming' | 'due' | 'overdue' | 'filed' | 'waived'
  status text not null default 'upcoming',
  -- when last filed
  filed_at timestamptz,
  -- proof of filing (storage path)
  filing_doc_path text,
  -- admin notes
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists obligations_client_id_idx on public.obligations (client_id);
create index if not exists obligations_status_idx on public.obligations (status);
create index if not exists obligations_due_at_idx on public.obligations (due_at);

alter table public.obligations enable row level security;
create policy "obligations: client own" on public.obligations for select using (client_id = auth.uid());
create policy "obligations: admin all" on public.obligations for all using (public.is_admin());
