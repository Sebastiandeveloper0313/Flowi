-- Custom-website webhook per team: the SEO agent POSTs finished articles to a
-- user-provided endpoint, signed with a per-team secret so the receiving site
-- can verify the sender. The endpoint URL lives in connections.config; the
-- signing secret lives in Vault (same pattern as the WordPress Application
-- Password: SECURITY DEFINER functions, executable by service_role only).

-- Store (or refresh) a team's webhook endpoint + signing secret.
create or replace function public.webhook_store_connection(
  p_team_id uuid,
  p_url text,
  p_secret text
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
   where team_id = p_team_id and provider = 'webhook'
   limit 1;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_secret, 'webhook_signing_secret_' || p_team_id::text);
  else
    perform vault.update_secret(v_secret_id, p_secret);
  end if;

  if v_id is null then
    insert into public.connections (team_id, provider, label, config)
    values (
      p_team_id,
      'webhook',
      p_url,
      jsonb_build_object('url', p_url, 'secret_id', v_secret_id)
    );
  else
    update public.connections
       set label = p_url,
           config = jsonb_build_object('url', p_url, 'secret_id', v_secret_id)
     where id = v_id;
  end if;
end;
$$;

-- Endpoint + decrypted signing secret for delivery. Service-role only.
create or replace function public.webhook_connection(p_team_id uuid)
returns table (url text, secret text)
language sql
security definer
set search_path = public
stable
as $$
  select c.config->>'url', ds.decrypted_secret
    from public.connections c
    join vault.decrypted_secrets ds on ds.id = (c.config->>'secret_id')::uuid
   where c.team_id = p_team_id and c.provider = 'webhook'
   limit 1;
$$;

-- Remove the connection and its Vault secret.
create or replace function public.webhook_delete_connection(p_team_id uuid)
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
   where team_id = p_team_id and provider = 'webhook'
   limit 1;

  delete from public.connections where team_id = p_team_id and provider = 'webhook';

  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
end;
$$;

-- These read/write secrets: nothing client-facing may call them.
revoke execute on function public.webhook_store_connection(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.webhook_connection(uuid) from public, anon, authenticated;
revoke execute on function public.webhook_delete_connection(uuid) from public, anon, authenticated;
