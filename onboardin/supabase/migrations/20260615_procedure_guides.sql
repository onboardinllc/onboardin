-- Procedure guides: deterministic formation blueprints (Ticket #05)

create table if not exists public.procedure_guides (
    id uuid primary key default gen_random_uuid(),
    slug text unique not null,
    name text not null,
    jurisdiction text not null,
    entity_type text not null,
    description text,
    blueprint jsonb not null,
    is_active boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table public.procedure_guides enable row level security;

grant execute on function public.is_admin() to authenticated;

drop policy if exists "procedure_guides: public select" on public.procedure_guides;
drop policy if exists "procedure_guides: admin all" on public.procedure_guides;
drop policy if exists "procedure_guides: admin insert" on public.procedure_guides;
drop policy if exists "procedure_guides: admin update" on public.procedure_guides;
drop policy if exists "procedure_guides: admin delete" on public.procedure_guides;

create policy "procedure_guides: public select"
on public.procedure_guides for select
using (true);

create policy "procedure_guides: admin insert"
on public.procedure_guides for insert
to authenticated
with check (public.is_admin());

create policy "procedure_guides: admin update"
on public.procedure_guides for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "procedure_guides: admin delete"
on public.procedure_guides for delete
to authenticated
using (public.is_admin());