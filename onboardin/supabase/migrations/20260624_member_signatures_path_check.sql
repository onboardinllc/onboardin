-- Preflight: remove any rows with non-conforming storage_path before CHECK.
-- CHECK applies to ALL rows (active and inactive). Deactivate alone is not enough.
-- Inspect first:
--   select id, storage_path from public.member_signatures
--   where storage_path !~ '^[0-9a-f-]{36}/signatures/signature-[0-9]+\.png$';
-- Orphaned storage objects under client-documents may remain; clean manually if needed.

delete from public.member_signatures
  where storage_path !~ '^[0-9a-f-]{36}/signatures/signature-[0-9]+\.png$';

-- Add storage path format constraint
alter table public.member_signatures
  add constraint member_signatures_storage_path_check
  check (storage_path ~ '^[0-9a-f-]{36}/signatures/signature-[0-9]+\.png$');
