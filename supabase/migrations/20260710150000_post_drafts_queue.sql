-- ============================================================
-- Sentrive - queue-with-cancel for Reddit posters
-- In Auto mode a Reddit poster no longer posts instantly (a burst of identical
-- cross-posts is a ban risk). Instead it staggers the chosen subreddits over a
-- few hours so the user can cancel or edit before any go out. Each pending
-- sub-post lives in post_drafts.posts as a {subreddit, status:'queued', at}
-- entry; scheduled_at is the next due time, which a per-minute drip drains.
-- ============================================================
alter table public.post_drafts
  add column if not exists scheduled_at timestamptz;

alter table public.post_drafts drop constraint if exists post_drafts_status_check;
alter table public.post_drafts
  add constraint post_drafts_status_check
  check (status in ('draft', 'queued', 'posted', 'dismissed'));

create index if not exists post_drafts_queue_idx
  on public.post_drafts (scheduled_at)
  where status = 'queued';
