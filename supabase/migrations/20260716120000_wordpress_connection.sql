-- WordPress connection per team, so the SEO agent can publish articles to the
-- user's own blog. The site URL + username live in connections.config; the
-- Application Password lives in Vault (same pattern as Slack bot tokens:
-- SECURITY DEFINER functions, executable by service_role only, never a
-- plaintext secret in a table).

-- Store (or refresh) a team's WordPress connection.
create or replace function public.wordpress_store_connection(
  p_team_id uuid,
  p_site_url text,
  p_username text,
  p_app_password text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_secret_id uuid;
begin
  select id, (config->>'secret_id')::uuid
    into v_id, v_secret_id
    from public.connections
   where team_id = p_team_id and provider = 'wordpress'
   limit 1;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_app_password, 'wordpress_app_password_' || p_team_id::text);
  else
    perform vault.update_secret(v_secret_id, p_app_password);
  end if;

  if v_id is null then
    insert into public.connections (team_id, provider, label, config)
    values (
      p_team_id,
      'wordpress',
      p_site_url,
      jsonb_build_object('site_url', p_site_url, 'username', p_username, 'secret_id', v_secret_id)
    );
  else
    update public.connections
       set label = p_site_url,
           config = jsonb_build_object('site_url', p_site_url, 'username', p_username, 'secret_id', v_secret_id)
     where id = v_id;
  end if;
end;
$$;

-- Credentials for publishing (decrypted). Service-role only.
create or replace function public.wordpress_connection(p_team_id uuid)
returns table (site_url text, username text, app_password text)
language sql
security definer
set search_path = public
stable
as $$
  select c.config->>'site_url', c.config->>'username', ds.decrypted_secret
    from public.connections c
    join vault.decrypted_secrets ds on ds.id = (c.config->>'secret_id')::uuid
   where c.team_id = p_team_id and c.provider = 'wordpress'
   limit 1;
$$;

-- Remove the connection and its Vault secret.
create or replace function public.wordpress_delete_connection(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret_id uuid;
begin
  select (config->>'secret_id')::uuid into v_secret_id
    from public.connections
   where team_id = p_team_id and provider = 'wordpress'
   limit 1;

  delete from public.connections where team_id = p_team_id and provider = 'wordpress';

  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
end;
$$;

-- These read/write secrets: nothing client-facing may call them.
revoke execute on function public.wordpress_store_connection(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.wordpress_connection(uuid) from public, anon, authenticated;
revoke execute on function public.wordpress_delete_connection(uuid) from public, anon, authenticated;
