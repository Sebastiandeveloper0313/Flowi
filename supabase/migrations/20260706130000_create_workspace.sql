-- Let a signed-in user spin up an additional workspace (product) in-app, each
-- with its own website/context and its own agents. The subscription and the
-- one-time onboarding live on the user's primary (first) team, so new products
-- are created already onboarded and never hit the paywall: one plan, many
-- products. SECURITY DEFINER so it can create the team + owner membership
-- atomically, but it always ties them to the caller.
create or replace function public.create_workspace(p_name text, p_website_url text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  insert into public.teams (name, created_by, website_url, onboarding_completed)
  values (
    coalesce(nullif(btrim(p_name), ''), 'New product'),
    v_uid,
    nullif(btrim(p_website_url), ''),
    true
  )
  returning id into v_team_id;
  insert into public.team_members (team_id, user_id, role)
  values (v_team_id, v_uid, 'owner');
  return v_team_id;
end;
$$;
