-- COJ Formation Packet (Ticket #10 Phase A)
-- Extends legal_templates with provider/filing/packet columns.
-- Seeds four COJ form rows for Jamaica Ltd incorporation.

alter table public.legal_templates
  add column if not exists provider text not null default 'onboardin',
  add column if not exists filing_channel text not null default 'vault_only',
  add column if not exists form_version text,
  add column if not exists packet_id text;

-- COJ forms must NOT match the unique index on (vault_card_id, kind, entity_type, jurisdiction)
-- used by Onboardin templates, because COJ rows share vault_card_id=articles but have unique kind.
insert into public.legal_templates
  (jurisdiction, entity_type, kind, label, vault_card_id, template_path,
   placeholder_map, field_map, active, provider, filing_channel, packet_id)
values
  (
    'Jamaica', 'Ltd', 'coj_form_6',
    'Form 6 - Name Reservation',
    'articles',
    'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-6.pdf',
    '{}'::jsonb, '{}'::jsonb, true, 'coj', 'coj_portal', 'jamaica_ltd_incorporation'
  ),
  (
    'Jamaica', 'Ltd', 'coj_brf1',
    'BRF1 Super Form',
    'articles',
    'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/brf1.pdf',
    '{}'::jsonb, '{}'::jsonb, true, 'coj', 'coj_portal', 'jamaica_ltd_incorporation'
  ),
  (
    'Jamaica', 'Ltd', 'coj_form_1a',
    'Form 1A - Articles',
    'articles',
    'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-1a.pdf',
    '{}'::jsonb, '{}'::jsonb, true, 'coj', 'coj_portal', 'jamaica_ltd_incorporation'
  ),
  (
    'Jamaica', 'Ltd', 'coj_bor',
    'BOR (Form A)',
    'articles',
    'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-a.pdf',
    '{}'::jsonb, '{}'::jsonb, true, 'coj', 'coj_portal', 'jamaica_ltd_incorporation'
  )
on conflict (vault_card_id, kind, entity_type, jurisdiction) do nothing;
