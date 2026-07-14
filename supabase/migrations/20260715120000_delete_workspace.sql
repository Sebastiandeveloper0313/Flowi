-- Let a user delete one of their additional workspaces in-app (removing its
-- agents, task runs, leads, chats, approvals, and drafts via cascade) without
-- deleting their whole account. The primary (first) workspace holds the
-- subscription and one-time onboarding, so it can't be removed here; deleting
-- everything is account deletion. SECURITY DEFINER so it can cascade-delete, but
-- it only ever touches a team the caller administers and never their primary.
create or replace function public.delete_workspace(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_primary uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Must be an admin/owner of the target team.
  if not public.is_team_admin(p_team_id) then
    raise exception 'not allowed';
  end if;

  -- The primary is the user's oldest workspace: it carries the plan, so it can
  -- only be removed by deleting the account.
  select tm.team_id
    into v_primary
  from public.team_members tm
  join public.teams t on t.id = tm.team_id
  where tm.user_id = v_uid
  order by t.created_at asc
  limit 1;

  if v_primary is null or v_primary = p_team_id then
    raise exception 'Cannot delete your primary workspace';
  end if;

  delete from public.teams where id = p_team_id;
end;
$$;

grant execute on function public.delete_workspace(uuid) to authenticated;
