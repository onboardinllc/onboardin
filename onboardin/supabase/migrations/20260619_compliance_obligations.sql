-- Ticket #08 Phase A — Recurring compliance obligations calendar
-- Promoted from scaffolds/sql/compliance_calendar.sql
--
-- RETIRED: onboardin/supabase/migrations/_scaffold_recurring_obligations.sql
--   (legacy public.obligations table). Do NOT apply. Use compliance_obligations only.

-- ── PREREQUISITES ───────────────────────────────────────────
-- Formation date for accurate due-date seeding (nullable; admin sets on step 2 complete)
alter table public.clients
  add column if not exists formation_confirmed_at timestamptz;

-- Updated-at helper (referenced by compliance_obligations trigger)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── TABLE ──────────────────────────────────────────────────
create table if not exists public.compliance_obligations (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients(id) on delete cascade,
  slug              text not null,
  title             text not null,
  description       text,
  authority         text,
  category          text not null default 'tax',
  frequency         text not null default 'annual',
  due_date          date,
  status            text not null default 'upcoming',
  fee_description   text,
  penalty_note      text,
  requirements      text[],
  action_url        text,
  reminder_days     int not null default 14,
  last_reminded_at  timestamptz,
  completed_at      timestamptz,
  proof_document_id uuid references public.documents(id) on delete set null,
  seeded_from       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Ticket #08 columns (safe if table already existed without them)
alter table public.compliance_obligations
  add column if not exists proof_document_id uuid references public.documents(id) on delete set null;

alter table public.compliance_obligations
  add column if not exists seeded_from text;

-- Idempotent seeding: one row per slug per client
alter table public.compliance_obligations
  drop constraint if exists compliance_obligations_client_slug_key;

alter table public.compliance_obligations
  add constraint compliance_obligations_client_slug_key unique (client_id, slug);

create index if not exists compliance_obligations_client_id_idx
  on public.compliance_obligations (client_id);

create index if not exists compliance_obligations_status_due_idx
  on public.compliance_obligations (status, due_date);

alter table public.compliance_obligations enable row level security;

grant execute on function public.is_admin() to authenticated;

drop policy if exists "compliance_obligations: client own" on public.compliance_obligations;
drop policy if exists "compliance_obligations: client update" on public.compliance_obligations;
drop policy if exists "compliance_obligations: admin all" on public.compliance_obligations;

create policy "compliance_obligations: client own"
  on public.compliance_obligations for select
  to authenticated
  using (client_id = auth.uid());

create policy "compliance_obligations: client update"
  on public.compliance_obligations for update
  to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

create policy "compliance_obligations: admin all"
  on public.compliance_obligations for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists compliance_obligations_updated_at on public.compliance_obligations;
create trigger compliance_obligations_updated_at
  before update on public.compliance_obligations
  for each row execute function public.set_updated_at();

-- ── SHARED AUTH HELPER ──────────────────────────────────────
create or replace function public.assert_client_access(p_client_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return;
  end if;
  if p_client_id is distinct from auth.uid()
     and not coalesce(public.is_admin(), false) then
    raise exception 'not authorized for client %', p_client_id using errcode = '42501';
  end if;
end;
$$;

-- ── OVERDUE HELPER VIEW ─────────────────────────────────────
create or replace view public.overdue_obligations as
  select
    co.*,
    c.company_name,
    c.founder_name,
    c.email,
    (current_date - co.due_date) as days_overdue
  from public.compliance_obligations co
  join public.clients c on c.id = co.client_id
  where co.status not in ('done', 'waived')
    and co.due_date is not null
    and (
      co.due_date < current_date
      or co.due_date <= current_date + coalesce(co.reminder_days, 14)
    )
  order by co.due_date asc;

-- ── UPCOMING HELPER FUNCTION ────────────────────────────────
create or replace function public.get_upcoming_obligations(
  p_client_id uuid,
  p_days      int default 30
)
returns table (
  id              uuid,
  slug            text,
  title           text,
  authority       text,
  category        text,
  due_date        date,
  status          text,
  fee_description text,
  penalty_note    text,
  days_until      int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_client_access(p_client_id);

  return query
  select
    co.id, co.slug, co.title, co.authority, co.category,
    co.due_date, co.status, co.fee_description, co.penalty_note,
    (co.due_date - current_date)::int as days_until
  from public.compliance_obligations co
  where co.client_id = p_client_id
    and co.status not in ('done', 'waived')
    and co.due_date <= (current_date + p_days)
  order by co.due_date asc;
end;
$$;

grant execute on function public.get_upcoming_obligations(uuid, int) to authenticated;

-- ── CLIENT UPDATE GUARD (status / proof only) ───────────────
create or replace function public.compliance_obligations_client_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.is_admin(), false) then
    return new;
  end if;

  if auth.uid() is distinct from old.client_id then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if new.status is distinct from old.status and new.status not in ('done') then
    raise exception 'clients may only mark obligations as done' using errcode = '42501';
  end if;

  if new.id is distinct from old.id
     or new.client_id is distinct from old.client_id
     or new.slug is distinct from old.slug
     or new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.authority is distinct from old.authority
     or new.category is distinct from old.category
     or new.frequency is distinct from old.frequency
     or new.due_date is distinct from old.due_date
     or new.fee_description is distinct from old.fee_description
     or new.penalty_note is distinct from old.penalty_note
     or new.requirements is distinct from old.requirements
     or new.action_url is distinct from old.action_url
     or new.reminder_days is distinct from old.reminder_days
     or new.last_reminded_at is distinct from old.last_reminded_at
     or new.seeded_from is distinct from old.seeded_from
     or new.created_at is distinct from old.created_at
  then
    raise exception 'clients may only update status, completed_at, and proof_document_id'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists compliance_obligations_client_update_guard on public.compliance_obligations;
create trigger compliance_obligations_client_update_guard
  before update on public.compliance_obligations
  for each row execute function public.compliance_obligations_client_update_guard();

-- ── SEED: JAMAICA LTD TEMPLATE OBLIGATIONS ─────────────────
create or replace function public.seed_jamaica_ltd_obligations(
  p_client_id      uuid,
  p_formation_date date default current_date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  tcc_first_due  date := p_formation_date + interval '90 days';
  tax_q1_due     date := date_trunc('year', p_formation_date)::date + interval '1 year' + interval '6 months';
  annual_due     date := date_trunc('year', p_formation_date)::date + interval '1 year' + interval '3 months' - interval '1 day';
  oic_renewal_due date := p_formation_date + interval '11 months';
begin
  perform public.assert_client_access(p_client_id);

  insert into public.compliance_obligations
    (client_id, slug, title, description, authority, category, frequency, due_date, status, fee_description, penalty_note, requirements, action_url, reminder_days, seeded_from)
  values (
    p_client_id,
    'tcc-renewal',
    'Tax Compliance Certificate Renewal',
    'Renew TCC every 90 days at TAJ. Required for government contracts and banking.',
    'TAJ', 'tax', 'days:90', tcc_first_due, 'upcoming',
    'No direct fee — requires statutory deductions to be current.',
    'Expired TCC blocks government contract eligibility and may cause banking friction.',
    ARRAY['NIS payments current','NHT payments current','HEART payments current','Education Tax current'],
    'https://www.jamaicatax.gov.jm/', 14, 'jamaica-ltd'
  )
  on conflict (client_id, slug) do nothing;

  insert into public.compliance_obligations
    (client_id, slug, title, description, authority, category, frequency, due_date, status, fee_description, penalty_note, requirements, action_url, reminder_days, seeded_from)
  values (
    p_client_id,
    'statutory-deductions',
    'NIS / NHT / HEART Monthly Returns',
    'Monthly statutory deductions due by last day of following month.',
    'NIS/NHT/HEART', 'statutory', 'monthly',
    (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date,
    'upcoming',
    'NIS 3%+3%, NHT 3%+2%, HEART 3% employer.',
    '10% surcharge plus interest on late payments.',
    ARRAY['Payroll records','Deduction calculations'],
    null, 7, 'jamaica-ltd'
  )
  on conflict (client_id, slug) do nothing;

  insert into public.compliance_obligations
    (client_id, slug, title, description, authority, category, frequency, due_date, status, fee_description, penalty_note, requirements, action_url, reminder_days, seeded_from)
  values (
    p_client_id,
    'corp-tax-q1',
    'Q1 Estimated Corporate Tax Payment',
    '25% of prior year corporate income tax liability.',
    'TAJ', 'tax', 'annual', tax_q1_due, 'upcoming',
    '25% of prior year liability (minimum $500 JMD for new companies).',
    '10% surcharge plus 1.5%/month interest on underpayment.',
    ARRAY['Prior year financials','TAJ online account'],
    'https://www.jamaicatax.gov.jm/', 21, 'jamaica-ltd'
  )
  on conflict (client_id, slug) do nothing;

  insert into public.compliance_obligations
    (client_id, slug, title, description, authority, category, frequency, due_date, status, fee_description, penalty_note, requirements, action_url, reminder_days, seeded_from)
  values (
    p_client_id,
    'coj-annual-return',
    'Annual Return (COJ)',
    'Company annual return to Companies Office of Jamaica.',
    'COJ', 'corporate', 'annual', annual_due, 'upcoming',
    'JMD ~$3,000 small company filing fee.',
    'Late fee applied. Possible deregistration after 3 consecutive missed years.',
    ARRAY['Current director details','Registered address','Share structure confirmation'],
    'https://www.orcjamaica.com/', 30, 'jamaica-ltd'
  )
  on conflict (client_id, slug) do nothing;

  insert into public.compliance_obligations
    (client_id, slug, title, description, authority, category, frequency, due_date, status, fee_description, penalty_note, requirements, action_url, reminder_days, seeded_from)
  values (
    p_client_id,
    'corp-income-tax',
    'Corporate Income Tax Return',
    'Annual filing of corporate income tax. 25% on net profit.',
    'TAJ', 'tax', 'annual',
    (date_trunc('year', p_formation_date)::date + interval '1 year' + interval '2 months' + interval '14 days'),
    'upcoming',
    '25% on net profit.',
    'Penalties and interest on late filing. Audited financials required above turnover threshold.',
    ARRAY['Audited financial statements','TAJ account','Prior year returns'],
    'https://www.jamaicatax.gov.jm/', 45, 'jamaica-ltd'
  )
  on conflict (client_id, slug) do nothing;

  -- From #07 recurring_obligation_seeds: OIC annual renewal
  insert into public.compliance_obligations
    (client_id, slug, title, description, authority, category, frequency, due_date, status, fee_description, penalty_note, requirements, action_url, reminder_days, seeded_from)
  values (
    p_client_id,
    'oic-annual-renewal',
    'OIC Annual Registration Renewal',
    'Annual renewal of Data Controller registration with the Office of the Information Commissioner.',
    'OIC', 'corporate', 'annual', oic_renewal_due, 'upcoming',
    '~JMD $25,000 annual registration fee.',
    'Operating without valid registration may attract JDPA enforcement action.',
    ARRAY['Current privacy policy URL','Registration portal access'],
    'https://www.oic.gov.jm/', 30, 'jamaica-ltd'
  )
  on conflict (client_id, slug) do nothing;
end;
$$;

grant execute on function public.seed_jamaica_ltd_obligations(uuid, date) to authenticated;