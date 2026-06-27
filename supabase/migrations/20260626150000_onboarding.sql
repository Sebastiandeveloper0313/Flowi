-- ============================================================
-- Flowy — onboarding + workspace business context
-- Everything collected during onboarding lives on the team
-- (the workspace), so the marketing agents can read it later.
-- ============================================================

alter table public.teams
  add column if not exists logo_url             text,
  add column if not exists website_url          text,
  add column if not exists business_description text,
  -- structured context extracted from the site/description by Claude:
  -- { summary, what_they_do, product, audience, voice, positioning, keywords[] }
  add column if not exists business_context     jsonb,
  add column if not exists team_size            text,
  add column if not exists monthly_revenue      text,
  add column if not exists owner_role           text,
  add column if not exists business_model       text,            -- 'b2b' | 'b2c' | 'both'
  add column if not exists business_categories  text[] not null default '{}',
  add column if not exists onboarding_completed  boolean not null default false,
  add column if not exists onboarding_step       smallint not null default 0;

-- ============================================================
-- Storage: workspace logos (public bucket, team-scoped writes)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('workspace-logos', 'workspace-logos', true)
on conflict (id) do nothing;

-- anyone can read logos (public bucket)
drop policy if exists "workspace logos read" on storage.objects;
create policy "workspace logos read" on storage.objects
  for select using (bucket_id = 'workspace-logos');

-- a user can write only under a folder named after a team they belong to: "<team_id>/..."
drop policy if exists "workspace logos insert" on storage.objects;
create policy "workspace logos insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'workspace-logos'
    and (storage.foldername(name))[1] in (
      select team_id::text from public.team_members where user_id = auth.uid()
    )
  );

drop policy if exists "workspace logos update" on storage.objects;
create policy "workspace logos update" on storage.objects
  for update to authenticated using (
    bucket_id = 'workspace-logos'
    and (storage.foldername(name))[1] in (
      select team_id::text from public.team_members where user_id = auth.uid()
    )
  );

drop policy if exists "workspace logos delete" on storage.objects;
create policy "workspace logos delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'workspace-logos'
    and (storage.foldername(name))[1] in (
      select team_id::text from public.team_members where user_id = auth.uid()
    )
  );
