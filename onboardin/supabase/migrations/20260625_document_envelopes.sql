-- document_envelopes: tracks multi-signer signing flows
create table if not exists public.document_envelopes (
  id                uuid        primary key default gen_random_uuid(),
  document_job_id   uuid        not null references public.document_jobs(id),
  client_id         uuid        not null references public.clients(id),
  template_id       uuid        not null references public.legal_templates(id),
  status            text        not null check (status in ('draft','pending','completed','voided')),
  created_by        uuid        not null references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  completed_at      timestamptz,
  finalize_lock     timestamptz
);

-- One active envelope per job (prevent race during finalize)
create unique index document_envelopes_active_job_idx
  on public.document_envelopes (document_job_id)
  where (status not in ('voided','completed'));

-- envelope_signers: one row per participant (initiator + invitees)
create table if not exists public.envelope_signers (
  id                    uuid        primary key default gen_random_uuid(),
  envelope_id           uuid        not null references public.document_envelopes(id) on delete cascade,
  email                 text        not null,
  display_name          text,
  field_keys            text[]      not null,
  is_initiator          boolean     not null default false,
  status                text        not null check (status in ('pending','opened','signed')),
  signer_user_id        uuid        references auth.users(id),
  signature_storage_path text,
  field_placements      jsonb       not null default '{}',
  signed_at             timestamptz,
  order_index           int         not null default 0,
  unique (envelope_id, email)
);

-- Only one initiator per envelope
create unique index envelope_signers_one_initiator_idx
  on public.envelope_signers (envelope_id)
  where (is_initiator = true);

-- sign_invites: magic link tokens (hash stored; raw token returned once to edge)
create table if not exists public.sign_invites (
  id                    uuid        primary key default gen_random_uuid(),
  envelope_signer_id    uuid        not null references public.envelope_signers(id) on delete cascade,
  token_hash            text        not null unique,
  expires_at            timestamptz not null default (now() + interval '14 days'),
  opened_at             timestamptz,
  revoked_at            timestamptz
);

-- ---------------------------------------------------------------------------
-- Paid plan helper — called by create-envelope edge (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
create or replace function public.client_has_paid_plan(p_client_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select coalesce(
    (select plan in ('growth','enterprise') from public.clients where id = p_client_id),
    false
  );
$$;

grant execute on function public.client_has_paid_plan(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.document_envelopes enable row level security;
alter table public.envelope_signers   enable row level security;
alter table public.sign_invites       enable row level security;

-- document_envelopes: initiator may SELECT; initiator may UPDATE status to 'voided'
-- NO direct client INSERT — create-envelope edge uses service role
create policy "envelope_initiator_select"
  on public.document_envelopes
  for select
  to authenticated
  using (client_id = auth.uid());

create policy "envelope_initiator_void"
  on public.document_envelopes
  for update
  to authenticated
  using (client_id = auth.uid())
  with check (status = 'voided');

-- envelope_signers: initiator SELECT only; no invitee access
create policy "envelope_signers_initiator_select"
  on public.envelope_signers
  for select
  to authenticated
  using (
    envelope_id in (
      select id from public.document_envelopes where client_id = auth.uid()
    )
  );

-- sign_invites: initiator SELECT (token_hash exposed — edge returns URLs, not hashes)
create policy "sign_invites_initiator_select"
  on public.sign_invites
  for select
  to authenticated
  using (
    envelope_signer_id in (
      select es.id from public.envelope_signers es
      join public.document_envelopes de on de.id = es.envelope_id
      where de.client_id = auth.uid()
    )
  );
