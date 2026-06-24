-- Allow clients to replace their own working copies (storage upsert + documents row update).

create policy "clients can update own documents"
  on public.documents for update
  to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

create policy "clients can update own files"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'client-documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'client-documents' and (storage.foldername(name))[1] = auth.uid()::text);