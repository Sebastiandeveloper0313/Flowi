-- Safe drip auto-posting for Reddit (auto mode).
--
-- Before: auto mode posted up to 5 replies back-to-back inside one agent run,
-- with no spacing. Bursting like that is exactly what trips Reddit's spam
-- filters and gets accounts flagged.
--
-- After: auto runs QUEUE the drafts with staggered post times and a per-day
-- cap, and a background poller drips them out one at a time. Users can tune the
-- pacing (how many per day, how far apart) per workspace.

-- leads: a 'queued' state (scheduled for auto-post), when to post it, and a
-- retry counter so a flaky post backs off instead of hammering.
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads
  add constraint leads_status_check
  check (status in ('new', 'approved', 'queued', 'dismissed', 'posted'));

alter table public.leads add column if not exists auto_post_at timestamptz;
alter table public.leads add column if not exists auto_post_attempts int not null default 0;

-- fast lookup for the drip poller (only the small set of pending posts)
create index if not exists leads_auto_post_due_idx
  on public.leads (auto_post_at)
  where status = 'queued';

-- teams: user-configurable pacing for auto mode. Conservative defaults.
alter table public.teams
  add column if not exists auto_post_per_day int not null default 10,
  add column if not exists auto_post_gap_minutes int not null default 8;

alter table public.teams drop constraint if exists teams_auto_post_per_day_chk;
alter table public.teams
  add constraint teams_auto_post_per_day_chk check (auto_post_per_day between 0 and 100);

alter table public.teams drop constraint if exists teams_auto_post_gap_minutes_chk;
alter table public.teams
  add constraint teams_auto_post_gap_minutes_chk check (auto_post_gap_minutes between 1 and 240);
