-- Add a 'skipped' outcome for task runs.
--
-- A run that couldn't do its job because a prerequisite is missing (the toolkit
-- isn't connected, the agent has no search terms, a slideshow has no images) was
-- being recorded as 'succeeded'. That made a brand-new, not-yet-connected agent
-- claim it "finished a task" it never really did. 'skipped' names that outcome
-- so it stops counting as completed work.
--
-- Widening a check constraint is safe: every existing row already satisfies the
-- narrower set, so nothing needs backfilling.
alter table public.task_runs drop constraint if exists task_runs_status_check;
alter table public.task_runs
  add constraint task_runs_status_check
  check (status in ('queued', 'running', 'succeeded', 'failed', 'skipped'));
