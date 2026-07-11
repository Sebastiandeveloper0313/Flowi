-- Atomically claim a run slot for a task.
--
-- Two triggers firing within milliseconds (e.g. an auto-run on agent creation
-- firing twice) could both pass the runner's "is a run already in progress?"
-- check and each insert a run, producing duplicate work and duplicate approvals.
-- The old check-then-insert in the runner is not atomic across concurrent calls.
--
-- This serializes the check-and-insert per task with an advisory lock so exactly
-- one concurrent caller wins: it returns the new run id; the others get NULL and
-- skip. The 4-minute freshness window matches the reaper, so an orphaned
-- 'running' row (a run whose function died) never wedges the task forever.
create or replace function public.claim_task_run(p_task_id uuid, p_team_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_run_id uuid;
begin
  -- Held only for this function's transaction (milliseconds), not for the run
  -- itself, so it never blocks the actual task execution that follows.
  perform pg_advisory_xact_lock(hashtextextended(p_task_id::text, 0));

  if exists (
    select 1
    from task_runs
    where task_id = p_task_id
      and status = 'running'
      and started_at > now() - interval '4 minutes'
  ) then
    return null;
  end if;

  insert into task_runs (task_id, team_id, status, started_at)
  values (p_task_id, p_team_id, 'running', now())
  returning id into v_run_id;

  return v_run_id;
end;
$$;

-- Only the runner (service role) should ever claim a run.
revoke all on function public.claim_task_run(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_task_run(uuid, uuid) to service_role;
