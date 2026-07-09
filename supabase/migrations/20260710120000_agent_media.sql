-- ============================================================
-- Sentrive - agent post media
-- A public bucket for images/videos a user attaches to a poster agent, so the
-- post can carry their own media. Public read (so Composio and the social APIs
-- can fetch the file by URL); writes are scoped to a team the user belongs to,
-- under a "<team_id>/..." path, mirroring the workspace-logos bucket.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('agent-media', 'agent-media', true)
on conflict (id) do nothing;

drop policy if exists "agent media read" on storage.objects;
create policy "agent media read" on storage.objects
  for select using (bucket_id = 'agent-media');

drop policy if exists "agent media insert" on storage.objects;
create policy "agent media insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'agent-media'
    and (storage.foldername(name))[1] in (
      select team_id::text from public.team_members where user_id = auth.uid()
    )
  );

drop policy if exists "agent media update" on storage.objects;
create policy "agent media update" on storage.objects
  for update to authenticated using (
    bucket_id = 'agent-media'
    and (storage.foldername(name))[1] in (
      select team_id::text from public.team_members where user_id = auth.uid()
    )
  );

drop policy if exists "agent media delete" on storage.objects;
create policy "agent media delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'agent-media'
    and (storage.foldername(name))[1] in (
      select team_id::text from public.team_members where user_id = auth.uid()
    )
  );
