-- Code review fixes: overdue view, RPC auth, client update guard
-- Apply after 20260619_compliance_obligations.sql + 20260619_us_obligations_seed.sql

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

-- ── OVERDUE VIEW (compute from due_date, not stored status) ─
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

-- ── UPCOMING HELPER (with caller authorization) ─────────────
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