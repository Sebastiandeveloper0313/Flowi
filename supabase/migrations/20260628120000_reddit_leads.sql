-- ============================================================
-- Flowy — Reddit lead monitoring (first real "doing" capability)
-- Generalizes to the wider platform: typed agents (kind) + a
-- source-tagged leads/findings model that will hold other sources later.
-- ============================================================

-- tasks gain a capability `kind` and a free-form `config`
-- (keywords, subreddits, thresholds for monitors).
alter table public.tasks
  add column kind text not null default 'content'
    check (kind in ('content', 'reddit_monitor')),
  add column config jsonb not null default '{}'::jsonb;

-- ============================================================
-- leads — things an agent found that need the user's attention/action.
-- `source` tags where it came from so the same model holds Reddit now
-- and (e.g.) X, HN, support tickets later.
-- ============================================================
create table public.leads (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  task_id     uuid references public.tasks (id) on delete set null,
  source      text not null default 'reddit',
  external_id text not null,              -- reddit fullname (t3_xxx); dedupe key
  url         text not null,
  title       text not null default '',
  snippet     text not null default '',
  author      text,
  subreddit   text,
  score       integer,                    -- popularity signal (upvotes)
  relevance   integer not null default 0, -- 0-100, the model's judgment
  reason      text,                       -- why it's a lead
  draft_reply text,                       -- suggested reply, editable by the user
  status      text not null default 'new'
    check (status in ('new', 'approved', 'dismissed', 'posted')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (team_id, source, external_id)
);

create index leads_team_idx on public.leads (team_id, status, created_at desc);
create index leads_task_idx on public.leads (task_id);

create trigger leads_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

alter table public.leads enable row level security;

-- Team members can read + manage (review / approve / dismiss / edit drafts).
-- Inserts from the monitor happen server-side via the service role (bypasses RLS).
create policy "leads all" on public.leads for all
  using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
