-- Public forms bucket: official government form PDFs hosted on-platform.
-- Path pattern: coj/{form-slug}.pdf, irs/{form-slug}.pdf
-- Read: public (anon). Write: service role only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('public-forms', 'public-forms', true, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "public-forms: public read"
  on storage.objects for select
  using (bucket_id = 'public-forms');

create policy "public-forms: service role insert"
  on storage.objects for insert
  with check (bucket_id = 'public-forms' and auth.role() = 'service_role');

create policy "public-forms: service role update"
  on storage.objects for update
  using (bucket_id = 'public-forms' and auth.role() = 'service_role');
