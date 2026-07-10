-- ============================================================
-- Sentrive - TikTok slideshows
-- A slideshow agent writes the on-screen text for a TikTok photo post: a hook
-- slide, a few value slides about the business, and a CTA slide. The slides are
-- rendered over the user's own images in the app (canvas) and downloaded to post
-- to TikTok. Text generation is server-side (the agent); rendering is the app.
-- ============================================================
create table public.slideshows (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  task_id    uuid references public.tasks (id) on delete cascade,
  title      text not null default '',
  slides     jsonb not null default '[]'::jsonb, -- [{ text, role }]
  caption    text not null default '',
  status     text not null default 'draft'
    check (status in ('draft', 'exported', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index slideshows_task_idx on public.slideshows (task_id, created_at desc);

create trigger slideshows_updated_at
  before update on public.slideshows
  for each row execute function public.set_updated_at();

alter table public.slideshows enable row level security;

create policy "slideshows all" on public.slideshows for all
  using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
