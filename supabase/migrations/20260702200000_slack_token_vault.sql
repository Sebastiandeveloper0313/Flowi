-- ============================================================
-- Flowy — move Slack bot tokens into Vault
-- Tokens were a plaintext column (service-role only via RLS, but unencrypted
-- at rest). Now each workspace's token lives as a Vault secret; the table
-- keeps only the secret id. Access goes through SECURITY DEFINER functions
-- that are executable by service_role only.
-- ============================================================

alter table public.slack_workspaces
  add column token_secret_id uuid,
  alter column bot_token drop not null;

-- Store (or refresh) a workspace install. Creates/updates the Vault secret and
-- upserts the row; never leaves a plaintext token in the table.
create or replace function public.slack_store_workspace(
  p_slack_team_id text,
  p_team_name text,
  p_bot_token text,
  p_bot_user_id text,
  p_installed_by_team_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret_id uuid;
begin
  select token_secret_id into v_secret_id
    from public.slack_workspaces where slack_team_id = p_slack_team_id;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_bot_token, 'slack_bot_token_' || p_slack_team_id);
  else
    perform vault.update_secret(v_secret_id, p_bot_token);
  end if;

  insert into public.slack_workspaces
      (slack_team_id, team_name, bot_user_id, token_secret_id, installed_by_team_id)
    values
      (p_slack_team_id, p_team_name, p_bot_user_id, v_secret_id, p_installed_by_team_id)
    on conflict (slack_team_id) do update set
      team_name = excluded.team_name,
      bot_user_id = excluded.bot_user_id,
      token_secret_id = excluded.token_secret_id,
      installed_by_team_id = coalesce(excluded.installed_by_team_id, public.slack_workspaces.installed_by_team_id),
      bot_token = null;
end;
$$;

-- Token for the workspace an event came from.
create or replace function public.slack_workspace_token(p_slack_team_id text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select ds.decrypted_secret
    from public.slack_workspaces w
    join vault.decrypted_secrets ds on ds.id = w.token_secret_id
   where w.slack_team_id = p_slack_team_id;
$$;

-- Token for a Flowy team's installed workspace (outbound notifications).
create or replace function public.slack_team_token(p_team_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select ds.decrypted_secret
    from public.slack_workspaces w
    join vault.decrypted_secrets ds on ds.id = w.token_secret_id
   where w.installed_by_team_id = p_team_id
   limit 1;
$$;

-- Service-role only: these read secrets, so nothing client-facing may call them.
revoke execute on function public.slack_store_workspace(text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.slack_workspace_token(text) from public, anon, authenticated;
revoke execute on function public.slack_team_token(uuid) from public, anon, authenticated;

-- Migrate any existing plaintext tokens into Vault, then clear them.
do $$
declare
  r record;
  v_secret_id uuid;
begin
  for r in select id, slack_team_id, bot_token from public.slack_workspaces where bot_token is not null loop
    v_secret_id := vault.create_secret(r.bot_token, 'slack_bot_token_' || r.slack_team_id);
    update public.slack_workspaces
       set token_secret_id = v_secret_id, bot_token = null
     where id = r.id;
  end loop;
end;
$$;
