-- ============================================================
-- Flowy — Slack workspaces
-- One row per Slack workspace that installed Flowy via "Add to Slack"
-- (OAuth). Holds that workspace's bot token so the events function can
-- reply as Flowy there. Identity stays per-user: each sender is matched
-- to their own Flowy account by email, so a workspace row grants nothing
-- by itself.
-- ============================================================
create table public.slack_workspaces (
  id            uuid primary key default gen_random_uuid(),
  slack_team_id text not null unique,
  team_name     text,
  bot_token     text not null,
  bot_user_id   text,
  installed_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger slack_workspaces_updated_at
  before update on public.slack_workspaces
  for each row execute function public.set_updated_at();

-- Service-role only: RLS on with no policies means clients can never read
-- these tokens; the edge functions use the service key.
alter table public.slack_workspaces enable row level security;
