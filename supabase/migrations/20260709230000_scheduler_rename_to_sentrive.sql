-- ============================================================
-- Sentrive - rename the scheduler internals from "flowy" to "sentrive".
-- Zero-downtime by design: the new dispatcher reads the sentrive_* Vault
-- secrets but FALLS BACK to the old flowy_* ones, so the scheduler keeps
-- firing even if the secret copy below is skipped for any reason. The old
-- cron job and dispatcher function are retired so nothing double-fires.
-- ============================================================

-- Copy the scheduler's Vault secrets to sentrive_* names. Best effort only:
-- the dispatcher's flowy_* fallback covers the case where this is skipped, so
-- this block must never fail the migration.
do $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'flowy_functions_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'flowy_service_role_key';
  if v_url is not null and not exists (select 1 from vault.secrets where name = 'sentrive_functions_url') then
    perform vault.create_secret(v_url, 'sentrive_functions_url');
  end if;
  if v_key is not null and not exists (select 1 from vault.secrets where name = 'sentrive_service_role_key') then
    perform vault.create_secret(v_key, 'sentrive_service_role_key');
  end if;
exception
  when others then null;
end $$;

-- New dispatcher: prefer the sentrive_* secrets, fall back to the legacy
-- flowy_* ones so nothing breaks mid-rename.
create or replace function public.sentrive_dispatch_due_tasks()
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
    from vault.decrypted_secrets
    where name in ('sentrive_functions_url', 'flowy_functions_url')
    order by (name = 'sentrive_functions_url') desc
    limit 1;
  select decrypted_secret into v_service_key
    from vault.decrypted_secrets
    where name in ('sentrive_service_role_key', 'flowy_service_role_key')
    order by (name = 'sentrive_service_role_key') desc
    limit 1;

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

-- Point the per-minute cron at the new dispatcher and retire the old job so
-- only one dispatcher fires each minute.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'flowy-run-due-tasks') then
    perform cron.unschedule('flowy-run-due-tasks');
  end if;
  if exists (select 1 from cron.job where jobname = 'sentrive-run-due-tasks') then
    perform cron.unschedule('sentrive-run-due-tasks');
  end if;
  perform cron.schedule(
    'sentrive-run-due-tasks',
    '* * * * *',
    $job$ select public.sentrive_dispatch_due_tasks(); $job$
  );
end $$;

-- Retire the old dispatcher (the cron no longer references it).
drop function if exists public.flowy_dispatch_due_tasks();
