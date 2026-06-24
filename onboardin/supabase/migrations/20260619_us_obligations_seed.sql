-- Ticket #08 Phase A - US entity compliance obligation seeds
-- Promoted from scaffolds/sql/us_obligations.sql
-- Requires: 20260619_compliance_obligations.sql

-- ── US LLC OBLIGATIONS ──────────────────────────────────────
create or replace function public.seed_us_llc_obligations(
  p_client_id      uuid,
  p_formation_date date default current_date,
  p_state          text default 'DE'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  boi_due           date := p_formation_date + interval '30 days';
  annual_report_due date;
  tax_return_due    date;
  seeded_from_label text := case p_state
    when 'WY' then 'us-wy-llc'
    else 'us-de-llc'
  end;
begin
  perform public.assert_client_access(p_client_id);

  annual_report_due := case p_state
    when 'DE' then make_date(extract(year from p_formation_date)::int + 1, 6, 1)
    when 'WY' then make_date(extract(year from p_formation_date)::int + 1, 12, 1)
    when 'FL' then make_date(extract(year from p_formation_date)::int + 1, 5, 1)
    else make_date(extract(year from p_formation_date)::int + 1, 4, 15)
  end;

  tax_return_due := make_date(extract(year from p_formation_date)::int + 1, 3, 15);

  insert into public.compliance_obligations
    (client_id, slug, title, description, authority, category, frequency,
     due_date, status, fee_description, penalty_note, requirements, action_url, reminder_days, seeded_from)
  values (
    p_client_id,
    'boi-report',
    'BOI Report (FinCEN)',
    'Beneficial Ownership Information under the Corporate Transparency Act. Required only for foreign-formed entities registered to do business in the U.S. Domestic U.S.-formed LLCs are not reporting companies under FinCEN''s March 2025 interim final rule.',
    'FinCEN', 'corporate', 'once',
    boi_due,
    case when boi_due < current_date then 'overdue' else 'upcoming' end,
    'Free to file.',
    'Civil penalties up to $591/day for willful violations. Criminal penalties up to $10,000 fine and 2 years imprisonment.',
    ARRAY['Beneficial owner name and address','Government-issued ID for each owner','Date of birth'],
    'https://www.fincen.gov/boi', 14, seeded_from_label
  )
  on conflict (client_id, slug) do nothing;

  insert into public.compliance_obligations
    (client_id, slug, title, description, authority, category, frequency,
     due_date, status, fee_description, penalty_note, requirements, action_url, reminder_days, seeded_from)
  values (
    p_client_id,
    'state-annual-report',
    'State Annual Report - ' || p_state,
    'Annual report and/or franchise tax filing to maintain good standing.',
    'Secretary of State - ' || p_state,
    'corporate', 'annual',
    annual_report_due,
    'upcoming',
    case p_state
      when 'DE' then '$300 franchise tax minimum (flat rate method for LLCs)'
      when 'WY' then '$60 minimum or 0.0002% of assets in Wyoming'
      when 'FL' then '$138.75 filing fee'
      else '$50-$500 depending on state'
    end,
    'Late fee applies. Loss of good standing blocks banking and contracts.',
    ARRAY['Registered agent address current','Beneficial owner information current'],
    case p_state
      when 'DE' then 'https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
      else null
    end,
    30, seeded_from_label
  )
  on conflict (client_id, slug) do nothing;

  insert into public.compliance_obligations
    (client_id, slug, title, description, authority, category, frequency,
     due_date, status, fee_description, penalty_note, requirements, action_url, reminder_days, seeded_from)
  values (
    p_client_id,
    'federal-tax-return',
    'Federal Tax Return (LLC)',
    'Annual federal tax filing. Single-member LLC: Schedule C on personal return. Multi-member: Form 1065.',
    'IRS', 'tax', 'annual',
    tax_return_due,
    'upcoming',
    'Free to file; accountant fees vary.',
    '$210/month penalty for late partnership returns. Extension available (Form 7004).',
    ARRAY['Profit and loss statement','Balance sheet','Bank statements','Prior year return'],
    'https://www.irs.gov/', 45, seeded_from_label
  )
  on conflict (client_id, slug) do nothing;

  insert into public.compliance_obligations
    (client_id, slug, title, description, authority, category, frequency,
     due_date, status, fee_description, penalty_note, requirements, action_url, reminder_days, seeded_from)
  values (
    p_client_id,
    'registered-agent-renewal',
    'Registered Agent Renewal',
    'Annual renewal of registered agent service to maintain legal address for service of process.',
    'Registered Agent Provider', 'corporate', 'annual',
    make_date(
      extract(year from p_formation_date)::int + 1,
      extract(month from p_formation_date)::int,
      extract(day from p_formation_date)::int
    ),
    'upcoming',
    '$49/yr via Onboardin or $50-$300/yr via third party.',
    'Lapsed registered agent results in loss of good standing and missed legal notices.',
    ARRAY['Payment of annual fee'],
    null, 30, seeded_from_label
  )
  on conflict (client_id, slug) do nothing;
end;
$$;

grant execute on function public.seed_us_llc_obligations(uuid, date, text) to authenticated;


-- ── DELAWARE C-CORP OBLIGATIONS ─────────────────────────────
create or replace function public.seed_us_de_c_corp_obligations(
  p_client_id      uuid,
  p_formation_date date default current_date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  boi_due           date := p_formation_date + interval '30 days';
  franchise_tax_due date := make_date(extract(year from p_formation_date)::int + 1, 3, 1);
  annual_report_due date := make_date(extract(year from p_formation_date)::int + 1, 3, 1);
  tax_return_due    date := make_date(extract(year from p_formation_date)::int + 1, 4, 15);
  s83b_due          date := p_formation_date + interval '30 days';
begin
  perform public.assert_client_access(p_client_id);

  insert into public.compliance_obligations
    (client_id, slug, title, description, authority, category, frequency,
     due_date, status, fee_description, penalty_note, requirements, action_url, reminder_days, seeded_from)
  values (
    p_client_id,
    '83b-election',
    '83(b) Election - Founder Stock',
    'IRS election to be taxed on restricted stock at grant date value, not vesting date. Must be filed within 30 days of stock grant.',
    'IRS', 'tax', 'once',
    s83b_due,
    case when s83b_due < current_date then 'overdue' else 'due-soon' end,
    'Free to file.',
    'Missing this window is not recoverable. At exit, all vested shares are taxed at ordinary income rates instead of capital gains. This is one of the most expensive founder mistakes.',
    ARRAY['Signed 83(b) election form (Onboardin generates)','Postmarked within 30 days of grant','Copy kept in The Vault'],
    'https://www.irs.gov/', 7, 'us-de-c-corp'
  )
  on conflict (client_id, slug) do nothing;

  insert into public.compliance_obligations
    (client_id, slug, title, description, authority, category, frequency,
     due_date, status, fee_description, penalty_note, requirements, action_url, reminder_days, seeded_from)
  values (
    p_client_id,
    'boi-report',
    'BOI Report (FinCEN)',
    'Beneficial Ownership Information report. Required within 30 days of incorporation.',
    'FinCEN', 'corporate', 'once',
    boi_due,
    case when boi_due < current_date then 'overdue' else 'upcoming' end,
    'Free.',
    'Civil penalties up to $591/day. Criminal penalties up to $10,000 and 2 years.',
    ARRAY['Director/officer beneficial owner details','Government-issued ID'],
    'https://www.fincen.gov/boi', 14, 'us-de-c-corp'
  )
  on conflict (client_id, slug) do nothing;

  insert into public.compliance_obligations
    (client_id, slug, title, description, authority, category, frequency,
     due_date, status, fee_description, penalty_note, requirements, action_url, reminder_days, seeded_from)
  values (
    p_client_id,
    'de-franchise-tax',
    'Delaware Franchise Tax + Annual Report',
    'Annual franchise tax and report due March 1. Use Assumed Par Value Capital Method to minimize tax for high-share-count companies.',
    'Delaware Division of Corporations', 'corporate', 'annual',
    annual_report_due,
    'upcoming',
    '$50 annual report fee + franchise tax (min $175, often $400-$600 for startups using Authorized Shares method - use Assumed Par Value method instead).',
    '$200 penalty + 1.5%/month interest for late filing. Loss of good standing.',
    ARRAY['Authorized shares count','Issued shares count','Par value','Gross assets'],
    'https://icis.corp.delaware.gov/', 45, 'us-de-c-corp'
  )
  on conflict (client_id, slug) do nothing;

  insert into public.compliance_obligations
    (client_id, slug, title, description, authority, category, frequency,
     due_date, status, fee_description, penalty_note, requirements, action_url, reminder_days, seeded_from)
  values (
    p_client_id,
    'federal-corp-tax',
    'Federal Corporate Tax Return (Form 1120)',
    'Annual C-Corp federal income tax return. Extension available via Form 7004.',
    'IRS', 'tax', 'annual',
    tax_return_due,
    'upcoming',
    'Free to file; accountant fees vary. Extension to October 15 via Form 7004.',
    '5% per month penalty on unpaid tax for late filing. Maximum 25%.',
    ARRAY['Audited or reviewed financial statements','Prior year return','All 1099s and W-2s issued'],
    'https://www.irs.gov/', 45, 'us-de-c-corp'
  )
  on conflict (client_id, slug) do nothing;

  insert into public.compliance_obligations
    (client_id, slug, title, description, authority, category, frequency,
     due_date, status, fee_description, penalty_note, requirements, action_url, reminder_days, seeded_from)
  values (
    p_client_id,
    'registered-agent-renewal',
    'Registered Agent Renewal',
    'Annual renewal. Delaware requires a physical agent with a Delaware address.',
    'Registered Agent Provider', 'corporate', 'annual',
    make_date(
      extract(year from p_formation_date)::int + 1,
      extract(month from p_formation_date)::int,
      extract(day from p_formation_date)::int
    ),
    'upcoming',
    '$49/yr via Onboardin or $50-$300/yr.',
    'Lapsed agent results in loss of good standing.',
    ARRAY['Payment of annual fee'],
    null, 30, 'us-de-c-corp'
  )
  on conflict (client_id, slug) do nothing;
end;
$$;

grant execute on function public.seed_us_de_c_corp_obligations(uuid, date) to authenticated;

-- Back-compat alias for scaffold name seed_de_ccorp_obligations
create or replace function public.seed_de_ccorp_obligations(
  p_client_id      uuid,
  p_formation_date date default current_date
)
returns void
language sql
security definer
set search_path = public
as $$
  select public.seed_us_de_c_corp_obligations(p_client_id, p_formation_date);
$$;

grant execute on function public.seed_de_ccorp_obligations(uuid, date) to authenticated;


-- ── ORCHESTRATOR ────────────────────────────────────────────
-- Resolves client profile, calls jurisdiction seed function, bridges Step 06 BOI dedup.
create or replace function public.seed_obligations_for_client(
  p_client_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country         text;
  v_jurisdiction    text;
  v_entity_type     text;
  v_formation_date  date;
  v_state           text;
  v_has_boi_artifact boolean;
begin
  perform public.assert_client_access(p_client_id);

  select
    c.country,
    c.jurisdiction,
    c.entity_type,
    coalesce(c.formation_confirmed_at::date, current_date)
  into
    v_country,
    v_jurisdiction,
    v_entity_type,
    v_formation_date
  from public.clients c
  where c.id = p_client_id;

  if not found then
    raise exception 'Client not found: %', p_client_id;
  end if;

 -- Jamaica Ltd
  if (
    lower(coalesce(v_country, '')) = 'jamaica'
    or lower(coalesce(v_jurisdiction, '')) = 'jamaica'
  ) and lower(coalesce(v_entity_type, '')) like '%ltd%' then
    perform public.seed_jamaica_ltd_obligations(p_client_id, v_formation_date);

 -- US LLC (Delaware default; Wyoming when jurisdiction matches)
  elsif lower(coalesce(v_country, '')) in ('united states', 'us', 'usa')
    and lower(coalesce(v_entity_type, '')) like '%llc%' then
    v_state := case
      when lower(coalesce(v_jurisdiction, '')) in ('wyoming', 'wy') then 'WY'
      when lower(coalesce(v_jurisdiction, '')) in ('delaware', 'de') then 'DE'
      when lower(coalesce(v_jurisdiction, '')) in ('florida', 'fl') then 'FL'
      else 'DE'
    end;
    perform public.seed_us_llc_obligations(p_client_id, v_formation_date, v_state);

 -- US Delaware C-Corp
  elsif (
    lower(coalesce(v_country, '')) in ('united states', 'us', 'usa')
    or lower(coalesce(v_jurisdiction, '')) in ('delaware', 'de')
  ) and (
    lower(coalesce(v_entity_type, '')) like '%c-corp%'
    or lower(coalesce(v_entity_type, '')) like '%c corp%'
    or lower(coalesce(v_entity_type, '')) = 'ccorp'
  ) then
    perform public.seed_us_de_c_corp_obligations(p_client_id, v_formation_date);

  else
    raise notice 'No compliance obligation seed template for client % (country=%, jurisdiction=%, entity_type=%)',
      p_client_id, v_country, v_jurisdiction, v_entity_type;
    return;
  end if;

 -- Step 06 bridge: BOI obligation vs Step 06 artifact (filed or domestic exemption ack)
  select exists (
    select 1
    from public.compliance_artifacts ca
    where ca.client_id = p_client_id
      and ca.kind in ('boi_fincen_confirmation', 'boi_exemption_acknowledgment')
      and ca.status = 'active'
  ) into v_has_boi_artifact;

  if v_has_boi_artifact then
    update public.compliance_obligations
    set
      status = case
        when exists (
          select 1 from public.compliance_artifacts ca
          where ca.client_id = p_client_id
            and ca.kind = 'boi_exemption_acknowledgment'
            and ca.status = 'active'
        ) then 'waived'
        else 'done'
      end,
      completed_at = coalesce(completed_at, now()),
      seeded_from = coalesce(seeded_from, 'step06-bridge'),
      updated_at = now()
    where client_id = p_client_id
      and slug = 'boi-report'
      and status not in ('done', 'waived');
  end if;
end;
$$;

grant execute on function public.seed_obligations_for_client(uuid) to authenticated;