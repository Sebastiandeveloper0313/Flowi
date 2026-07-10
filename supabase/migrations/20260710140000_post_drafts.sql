-- ============================================================
-- Sentrive - Reddit post drafts
-- Outbound community posts a poster agent writes for the user to review. Unlike
-- leads (inbound prospects), these are content the user reviews, edits, and
-- publishes to one or more subreddits in a click. Posting happens from the app
-- (or auto mode) rather than the model, so we can honor edits and track a result
-- per subreddit. Same content can be cross-posted to several subreddits.
-- ============================================================
create table public.post_drafts (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  task_id     uuid references public.tasks (id) on delete cascade,
  title       text not null default '',
  body        text not null default '',
  subreddits  text[] not null default '{}',        -- candidate targets (no r/ prefix)
  status      text not null default 'draft'
    check (status in ('draft', 'posted', 'dismissed')),
  posts       jsonb not null default '[]'::jsonb,   -- [{subreddit, status, url, error, at}]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index post_drafts_task_idx on public.post_drafts (task_id, created_at desc);
create index post_drafts_team_idx on public.post_drafts (team_id, status, created_at desc);

create trigger post_drafts_updated_at
  before update on public.post_drafts
  for each row execute function public.set_updated_at();

alter table public.post_drafts enable row level security;

-- Team members review/edit/publish/dismiss their drafts. Inserts from the agent
-- runner happen server-side via the service role (bypasses RLS).
create policy "post_drafts all" on public.post_drafts for all
  using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
