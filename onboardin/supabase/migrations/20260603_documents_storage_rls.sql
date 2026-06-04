-- RLS for documents table
alter table public.documents enable row level security;

create policy "clients can insert own documents"
  on public.documents for insert
  to authenticated
  with check (client_id = auth.uid());

create policy "clients can select own documents"
  on public.documents for select
  to authenticated
  using (client_id = auth.uid());

create policy "clients can delete own documents"
  on public.documents for delete
  to authenticated
  using (client_id = auth.uid());

create policy "admins can select all documents"
  on public.documents for select
  to authenticated
  using (exists (select 1 from public.clients where id = auth.uid() and is_admin = true));

-- RLS for storage: client-documents bucket
create policy "clients can upload own files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'client-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "clients can read own files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'client-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "clients can delete own files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'client-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "admins can read all files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'client-documents' and exists (select 1 from public.clients where id = auth.uid() and is_admin = true));
