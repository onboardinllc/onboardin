-- Phase A: admin workflow primitives
-- Idempotent.

-- Per-step status (jsonb keyed by step index: { "0": "done", "1": "in_progress", ... })
-- Statuses: not_started | in_progress | blocked | awaiting_client | done
alter table public.clients
  add column if not exists step_statuses jsonb not null default '{}'::jsonb;

-- Lifecycle status — distinct from onboarding_step (which is formation progress)
-- Values: onboarding | active | paused | churned | archived
alter table public.clients
  add column if not exists lifecycle text not null default 'onboarding';

-- Index for filter bar queries
create index if not exists clients_lifecycle_idx on public.clients (lifecycle);
create index if not exists clients_plan_idx on public.clients (plan);
