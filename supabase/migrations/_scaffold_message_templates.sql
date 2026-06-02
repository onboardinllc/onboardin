-- SCAFFOLD — NOT YET ENABLED. Authored for future implementation.
-- Saved message templates so admins don't retype common responses.
-- Templates support {{variable}} substitution against client profile fields.
--
-- Run this only when the "Message Templates" feature is being implemented.

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  -- short admin-facing slug
  slug text not null unique,
  -- display name in the dropdown
  label text not null,
  -- message body with {{founder_name}}, {{company_name}}, {{jurisdiction}}, {{entity_type}} placeholders
  body text not null,
  -- when to surface it: 'always' | 'step:{n}' | 'lifecycle:active' | 'plan:growth'
  surface_when text not null default 'always',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.message_templates enable row level security;
create policy "templates: admin all" on public.message_templates for all using (public.is_admin());
