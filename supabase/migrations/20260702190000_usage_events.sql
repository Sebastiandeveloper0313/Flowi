-- ============================================================
-- Flowy — usage events
-- One row per metered action (chat message, website analysis, ...), written
-- server-side by the edge functions, so per-team daily caps can be enforced
-- even against clients that bypass the UI. Service-role only.
-- ============================================================
create table public.usage_events (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  kind       text not null,          -- 'chat' | 'analyze_website' | ...
  created_at timestamptz not null default now()
);

create index usage_events_team_kind_time_idx
  on public.usage_events (team_id, kind, created_at desc);

-- RLS on with no policies: clients can neither read nor forge usage rows.
alter table public.usage_events enable row level security;
