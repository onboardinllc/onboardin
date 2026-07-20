-- Security hardening: items 9-12 (RLS, job state machine, sealed storage paths)

-- ---------------------------------------------------------------------------
-- client-documents bucket must stay private
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('client-documents', 'client-documents', false, 52428800)
on conflict (id) do update set public = false;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.storage_object_is_member_sealed(p_name text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_name, '') ~ '/signed-[0-9]+\.pdf$'
      or coalesce(p_name, '') ~ '/envelope-signatures/';
$$;

create or replace function public.documents_path_is_sealed(p_path text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_path, '') ~ 'signed-[0-9]+\.pdf$';
$$;

-- ---------------------------------------------------------------------------
-- document_jobs: terminal state guard (service role bypass for edges)
-- ---------------------------------------------------------------------------
create or replace function public.guard_document_job_mutation()
returns trigger
language plpgsql
as $$
declare
  jwt_role text;
begin
  jwt_role := coalesce(current_setting('request.jwt.claim.role', true), '');

  if jwt_role = 'service_role' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status in ('signed', 'voided') and new.status is distinct from old.status then
      raise exception 'document job status is terminal';
    end if;

    if old.status = 'signed' and (
      new.field_values is distinct from old.field_values
      or new.field_placements is distinct from old.field_placements
      or new.filled_path is distinct from old.filled_path
      or new.signed_path is distinct from old.signed_path
    ) then
      raise exception 'signed document job is immutable';
    end if;

    if old.status in ('signed', 'pending_signatures') and new.status in ('filled', 'context_preview', 'prefilled', 'working_saved') then
      raise exception 'cannot revert document job to an editable fill state';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists document_jobs_guard_mutation on public.document_jobs;
create trigger document_jobs_guard_mutation
  before update on public.document_jobs
  for each row execute function public.guard_document_job_mutation();

-- Split client "for all" into explicit policies with tighter insert check
drop policy if exists "document_jobs: client own" on public.document_jobs;

create policy "document_jobs: client select"
  on public.document_jobs for select
  to authenticated
  using (client_id = auth.uid());

create policy "document_jobs: client insert"
  on public.document_jobs for insert
  to authenticated
  with check (
    client_id = auth.uid()
    and status not in ('signed', 'voided')
  );

create policy "document_jobs: client update"
  on public.document_jobs for update
  to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

-- ---------------------------------------------------------------------------
-- document_envelopes: void only from draft/pending
-- ---------------------------------------------------------------------------
drop policy if exists "envelope_initiator_void" on public.document_envelopes;

create policy "envelope_initiator_void"
  on public.document_envelopes
  for update
  to authenticated
  using (client_id = auth.uid() and status in ('draft', 'pending'))
  with check (status = 'voided' and client_id = auth.uid());

revoke insert, update, delete on public.document_envelopes from anon;
revoke insert, update, delete on public.envelope_signers from anon;
revoke insert, update, delete on public.sign_invites from anon;

grant select, update on public.document_envelopes to authenticated;
grant select on public.envelope_signers to authenticated;
grant select on public.sign_invites to authenticated;

revoke select (token_hash) on public.sign_invites from authenticated;

-- ---------------------------------------------------------------------------
-- client_has_paid_plan: no cross-client probing
-- ---------------------------------------------------------------------------
create or replace function public.client_has_paid_plan(p_client_id uuid)
returns boolean
language plpgsql stable
security definer
set search_path = public
as $$
begin
  if p_client_id is distinct from auth.uid()
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and not public.is_admin() then
    return false;
  end if;

  return coalesce(
    (select plan in ('growth', 'enterprise') from public.clients where id = p_client_id),
    false
  );
end;
$$;

grant execute on function public.client_has_paid_plan(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- documents: path must live under owner prefix; sealed paths immutable
-- ---------------------------------------------------------------------------
drop policy if exists "clients can insert own documents" on public.documents;

create policy "clients can insert own documents"
  on public.documents for insert
  to authenticated
  with check (
    client_id = auth.uid()
    and (
      path is null
      or path like auth.uid()::text || '/%'
    )
  );

create or replace function public.guard_documents_sealed_path()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and public.documents_path_is_sealed(old.path)
     and new.path is distinct from old.path then
    raise exception 'sealed document path is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists documents_guard_sealed_path on public.documents;
create trigger documents_guard_sealed_path
  before update on public.documents
  for each row execute function public.guard_documents_sealed_path();

-- ---------------------------------------------------------------------------
-- storage: block member delete/update on sealed artifacts and envelope sig PNGs
-- ---------------------------------------------------------------------------
drop policy if exists "clients can delete own files" on storage.objects;
drop policy if exists "clients can update own files" on storage.objects;

create policy "clients can delete own files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'client-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.storage_object_is_member_sealed(name)
  );

create policy "clients can update own files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'client-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.storage_object_is_member_sealed(name)
  )
  with check (
    bucket_id = 'client-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.storage_object_is_member_sealed(name)
  );

-- Align admin checks with shared helper
drop policy if exists "admins can select all documents" on public.documents;
create policy "admins can select all documents"
  on public.documents for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admins can read all files" on storage.objects;
create policy "admins can read all files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'client-documents' and public.is_admin());

grant execute on function public.is_admin() to authenticated;
