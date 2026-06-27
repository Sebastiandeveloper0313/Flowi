-- ============================================================
-- Flowy — scheduler wiring
-- Every minute, pg_cron calls the `run-due-tasks` Edge Function, which runs
-- any active recurring task that's due. The function URL and service key are
-- read from Vault (set per-environment) so no secrets live in version control.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- Dispatcher: POST to the scheduler function using Vault-stored config.
-- No-ops safely until the two Vault secrets are set, so this migration is
-- harmless to apply in any environment.
create or replace function public.flowy_dispatch_due_tasks()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_url    text;
  v_service_key text;
begin
  select decrypted_secret into v_base_url
    from vault.decrypted_secrets where name = 'flowy_functions_url';
  select decrypted_secret into v_service_key
    from vault.decrypted_secrets where name = 'flowy_service_role_key';

  if v_base_url is null or v_service_key is null then
    return; -- not configured yet
  end if;

  perform net.http_post(
    url     := v_base_url || '/run-due-tasks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body    := '{}'::jsonb
  );
end;
$$;

-- Schedule it once per minute (re-create idempotently).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'flowy-run-due-tasks') then
    perform cron.unschedule('flowy-run-due-tasks');
  end if;
  perform cron.schedule(
    'flowy-run-due-tasks',
    '* * * * *',
    $job$ select public.flowy_dispatch_due_tasks(); $job$
  );
end;
$$;
