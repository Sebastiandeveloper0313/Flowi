-- ============================================================
-- Flowy — autonomy mode
-- How much Flowy is allowed to do on its own. Lives on the team (workspace)
-- so it applies to both the chat and unattended agents.
--   'ask'  — high-stakes actions (sending email, etc.) are queued for approval
--   'auto' — Flowy carries them out on its own
-- Default 'ask': nothing reaches the outside world unattended until the user
-- opts into auto.
-- ============================================================
alter table public.teams
  add column if not exists autonomy_mode text not null default 'ask'
    check (autonomy_mode in ('ask', 'auto'));
