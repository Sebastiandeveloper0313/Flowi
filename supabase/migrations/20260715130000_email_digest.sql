-- Candidate rows for the daily agent-activity digest email. One row per entitled
-- user (owner of a pro/internal team, since free accounts' agents don't run) who
-- has fresh activity in the last 24h: new leads found or replies auto-posted.
-- Each row also carries the standing "pending" backlog (drafted replies waiting
-- for manual review) so the email can nudge them to post or switch to auto.
-- SECURITY DEFINER so the scheduler (service role) can read across auth.users.
create or replace function public.email_digest_candidates()
returns table (
  user_id uuid,
  email text,
  full_name text,
  new_leads bigint,
  pending bigint,
  posted bigint
)
language sql
security definer
set search_path = public
as $$
  with entitled as (
    select distinct created_by as uid from public.teams where plan in ('pro', 'internal')
  ),
  ut as (
    select e.uid, t.id as team_id
    from entitled e
    join public.teams t on t.created_by = e.uid
  ),
  lead_stats as (
    select ut.uid,
      count(*) filter (where l.created_at > now() - interval '24 hours') as new_leads,
      count(*) filter (where l.status = 'new' and l.draft_reply is not null) as pending
    from ut
    join public.leads l on l.team_id = ut.team_id
    group by ut.uid
  ),
  post_stats as (
    select ut.uid, count(*) as posted
    from ut
    join public.task_runs r on r.team_id = ut.team_id
    where r.status = 'succeeded'
      and r.summary ilike 'Auto-posted%'
      and r.created_at > now() - interval '24 hours'
    group by ut.uid
  )
  select
    u.id as user_id,
    u.email::text,
    pr.full_name,
    coalesce(ls.new_leads, 0) as new_leads,
    coalesce(ls.pending, 0) as pending,
    coalesce(ps.posted, 0) as posted
  from entitled e
  join auth.users u on u.id = e.uid
  left join lead_stats ls on ls.uid = e.uid
  left join post_stats ps on ps.uid = e.uid
  left join public.profiles pr on pr.id = e.uid
  where coalesce(ls.new_leads, 0) > 0 or coalesce(ps.posted, 0) > 0;
$$;

grant execute on function public.email_digest_candidates() to service_role;
