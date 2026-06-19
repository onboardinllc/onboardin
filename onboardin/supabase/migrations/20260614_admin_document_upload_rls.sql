-- Admin document upload: storage file + documents row
-- Requires 20260603_documents_storage_rls.sql applied first.

-- Legacy policies call public.is_admin() but authenticated role lacked EXECUTE,
-- causing permission denied during RLS evaluation (not just deny).
grant execute on function public.is_admin() to authenticated;

-- Redundant ALL policies; superseded by narrow INSERT policies below.
drop policy if exists "storage: admin all" on storage.objects;
drop policy if exists "documents: admin all" on public.documents;

create policy "admins can upload client files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'client-documents'
    and exists (
      select 1 from public.clients
      where id = auth.uid() and is_admin = true
    )
    and exists (
      select 1 from public.clients
      where id = ((storage.foldername(name))[1])::uuid
    )
  );

create policy "admins can insert client documents"
  on public.documents for insert
  to authenticated
  with check (
    exists (
      select 1 from public.clients
      where id = auth.uid() and is_admin = true
    )
    and exists (
      select 1 from public.clients
      where id = client_id
    )
  );